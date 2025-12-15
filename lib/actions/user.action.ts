'use server';

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";

import { plaidClient } from '@/lib/plaid';
import { revalidatePath } from "next/cache"; 
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {
    const { database } = await createAdminClient();

    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal('userId', userId)]
    )
    
    if (!user || !user.documents || user.documents.length === 0) {
      return null;
    }
    
    return parseStringify(user.documents[0]);
  } catch (error) {
    console.log(error);
    return null;
  }
}

export const signIn = async ({ email, password }: signInProps) => {
    try {
    const { account, database } = await createAdminClient();
      const session = await account.createEmailPasswordSession(email, password);
  
      (await cookies()).set("appwrite-session", session.secret, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: true,
      });
  
    let user = await getUserInfo({ userId: session.userId });

    // If user document doesn't exist in database, create it from auth account
    if (!user) {
      try {
        // Get account info from Appwrite Auth using admin client Users API
        const { user: usersApi } = await createAdminClient();
        let accountInfo: any = null;
        
        try {
          accountInfo = await usersApi.get(session.userId);
        } catch (userError: any) {
          // If Users API fails, use email from sign-in params
          console.log('Could not get user from Users API, using email from params');
          accountInfo = {
            email: email,
            name: email.split('@')[0], // Use email prefix as name
            $id: session.userId
          };
        }
        
        // Create user document in database with basic info
        // Use email from params if accountInfo doesn't have it
        const userEmail = accountInfo?.email || email;
        const userName = accountInfo?.name || userEmail.split('@')[0];
        const nameParts = userName.split(' ');
        
        const newUser = await database.createDocument(
          DATABASE_ID!,
          USER_COLLECTION_ID!,
          ID.unique(),
          {
            userId: session.userId,
            email: userEmail,
            name: userName,
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' ') || '',
            // Add empty strings for required fields that might be needed
            address1: '',
            city: '',
            state: '',
            postalCode: '',
            dateOfBirth: '',
            ssn: '',
            // Required Dwolla fields - will be created later when user connects bank
            dwollaCustomerUrl: '',
            dwollaCustomerId: '',
          }
        );
        
        user = parseStringify(newUser);
        console.log('Successfully created user document for:', userEmail);
      } catch (createError: any) {
        console.error('Failed to create user document:', createError);
        console.error('Error details:', {
          message: createError?.message,
          code: createError?.code,
          type: createError?.type,
          response: createError?.response
        });
        
        // If creation fails, check if user was created by another process
        user = await getUserInfo({ userId: session.userId });
        if (!user) {
          // If still no user, throw a more helpful error
          const errorMessage = createError?.message || 'Unknown error';
          const errorCode = createError?.code || 'UNKNOWN';
          throw new Error(`Failed to create user document: ${errorMessage} (Code: ${errorCode}). User ID: ${session.userId}`);
        }
      }
    }

    if (!user) {
      throw new Error('User not found in database');
    }

    return parseStringify(user);
    } catch (error) {
    console.error('Error', error);
      throw error;
    }
  }
  
  export const signUp = async ({ password, ...userData }: SignUpParams) => {
    const { email, firstName, lastName } = userData;
    
    let newUserAccount;
  
    try {
      const { account, database } = await createAdminClient();
  
      newUserAccount = await account.create(
        ID.unique(), 
        email, 
        password, 
        `${firstName} ${lastName}`
      );
  
      if(!newUserAccount) throw new Error('Error creating user')
  
      const dwollaCustomerUrl = await createDwollaCustomer({
        ...userData,
        type: 'personal'
      });
  
      if(!dwollaCustomerUrl) throw new Error('Error creating Dwolla customer')
  
      const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
          ID.unique(),
          {
            ...userData,
            userId: newUserAccount.$id,
            dwollaCustomerId,
            dwollaCustomerUrl
          }
        )
  
      const session = await account.createEmailPasswordSession(email, password);
  
      (await cookies()).set("appwrite-session", session.secret, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: true,
      });
  
      return parseStringify(newUser);
    } catch (error) {
      console.error('Error', error);
    }
  } 

  export async function getLoggedInUser() {
    try {
      const { account } = await createSessionClient();
    const result = await account.get();

    const user = await getUserInfo({ userId: result.$id});

    if (!user) {
      return null;
    }

    return parseStringify(user);
    } catch (error) {
    console.log(error);
      return null;
    }
  }

  export const logoutAccount = async () => {
    try {
      const { account } = await createSessionClient();
  
      (await cookies()).delete('appwrite-session');
  
      await account.deleteSession('current');
    } catch (error) {
      return null;
    }
  }

  export const createLinkToken = async (user: User) => {
    try {
      const tokenParams = {
        user: {
          client_user_id: user.$id
        },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ['auth'] as Products[],
        language: 'en',
        country_codes: ['US'] as CountryCode[],
      }
  
      const response = await plaidClient.linkTokenCreate(tokenParams);
  
      return parseStringify({ linkToken: response.data.link_token })
    } catch (error) {
      console.log(error);
    }
  }

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: createBankAccountProps) => {
  try {
    const { database } = await createAdminClient();

    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        shareableId,
      }
    )

    return parseStringify(bankAccount);
  } catch (error) {
    console.log(error);
  }
}

  export const exchangePublicToken = async ({
    publicToken,
    user,
  }: exchangePublicTokenProps) => {
    try {
      // Exchange public token for access token and item ID
      const response = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });
  
      const accessToken = response.data.access_token;
      const itemId = response.data.item_id;
      
      // Get account information from Plaid using the access token
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });
  
      const accountData = accountsResponse.data.accounts[0];
  
      // Create a processor token for Dwolla using the access token and account ID
      const request: ProcessorTokenCreateRequest = {
        access_token: accessToken,
        account_id: accountData.account_id,
        processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
      };
  
      const processorTokenResponse = await plaidClient.processorTokenCreate(request);
      const processorToken = processorTokenResponse.data.processor_token;

       // Create a funding source URL for the account using the Dwolla customer ID, processor token, and bank name
     const fundingSourceUrl = await addFundingSource({
             dwollaCustomerId: user.dwollaCustomerId,
             processorToken,
             bankName: accountData.name,
           });
    
    // If the funding source URL is not created, throw an error
    if (!fundingSourceUrl) throw Error;

      // Create a bank account using the user ID, item ID, account ID, access token, funding source URL, and shareableId ID
      await createBankAccount({
        userId: user.$id,
        bankId: itemId,
        accountId: accountData.account_id,
        accessToken,
      fundingSourceUrl,
      shareableId: encryptId(accountData.account_id),
      });
  
      // Revalidate the path to reflect the changes
      revalidatePath("/");
  
      // Return a success message
      return parseStringify({
        publicTokenExchange: "complete",
      });
    } catch (error) {
      console.error("An error occurred while creating exchanging token:", error);
    }
  }

  export const getBanks = async ({ userId }: getBanksProps) => {
    try {
      const { database } = await createAdminClient();
  
      const banks = await database.listDocuments(
        DATABASE_ID!,
        BANK_COLLECTION_ID!,
        [Query.equal('userId', userId)]
      )
  
      return parseStringify(banks.documents);
    } catch (error) {
    console.log(error)
    }
  }

  export const getBank = async ({ documentId }: getBankProps) => {
    try {
      const { database } = await createAdminClient();
  
      const bank = await database.listDocuments(
        DATABASE_ID!,
        BANK_COLLECTION_ID!,
        [Query.equal('$id', documentId)]
      )
  
    return parseStringify(bank.documents[0]);
    } catch (error) {
    console.log(error)
    }
  }

  export const getBankByAccountId = async ({ accountId }: getBankByAccountIdProps) => {
    try {
      const { database } = await createAdminClient();

      const bank = await database.listDocuments(
        DATABASE_ID!,
        BANK_COLLECTION_ID!,
        [Query.equal('accountId', accountId)]
      )

      console.log('getBankByAccountId result:', {
        accountId,
        total: bank.total,
        found: bank.documents.length > 0,
        fundingSource: bank.documents[0]?.fundingSource || 'missing'
      });

      if(bank.total !== 1) {
        console.log('Bank not found or multiple banks found for accountId:', accountId);
        return null;
      }

      const bankData = parseStringify(bank.documents[0]);
      console.log('Bank data retrieved:', {
        bankId: bankData.$id,
        accountId: bankData.accountId,
        hasFundingSource: !!bankData.fundingSource,
        fundingSource: bankData.fundingSource
      });

      return bankData;
        } catch (error) {
    console.error('Error in getBankByAccountId:', error)
    return null;
  }
}

export const ensureReceiverFundingSource = async ({
  bankId,
  accountId,
  accessToken,
  userId,
}: {
  bankId: string;
  accountId: string;
  accessToken: string;
  userId: string;
}) => {
  try {
    console.log('ensureReceiverFundingSource called with:', {
      bankId,
      accountId,
      hasAccessToken: !!accessToken,
      accessTokenType: accessToken === 'test-token' ? 'test' : 'real',
      userId
    });

    // Check if access token is valid (not test token)
    if (!accessToken || accessToken === 'test-token') {
      throw new Error('Receiver bank does not have a valid Plaid access token. The bank account needs to be connected through Plaid.');
    }

    // Get receiver user info to get Dwolla customer ID
    const receiverUser = await getUserInfo({ userId });
    
    console.log('Receiver user info:', {
      userId,
      hasUser: !!receiverUser,
      dwollaCustomerId: receiverUser?.dwollaCustomerId || 'missing'
    });
    
    if (!receiverUser || !receiverUser.dwollaCustomerId) {
      throw new Error('Receiver user does not have a Dwolla customer ID. Please ensure the receiver has completed their account setup.');
    }

    // Create processor token for this account
    console.log('Creating processor token for account:', accountId);
    const processorTokenRequest: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountId,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(processorTokenRequest);
    const processorToken = processorTokenResponse.data.processor_token;
    console.log('Processor token created successfully');

    // Get account name from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    
    const accountData = accountsResponse.data.accounts.find(
      (acc: any) => acc.account_id === accountId
    );
    
    const bankName = accountData?.name || 'Bank Account';
    console.log('Bank name:', bankName);

    // Create funding source
    console.log('Creating funding source in Dwolla...');
    const { addFundingSource } = await import('./dwolla.actions');
    
    let fundingSourceUrl: string | null = null;
    try {
      fundingSourceUrl = await addFundingSource({
        dwollaCustomerId: receiverUser.dwollaCustomerId,
        processorToken,
        bankName,
      });
    } catch (fundingError: any) {
      console.error('Error creating funding source:', fundingError);
      // Check if it's a duplicate error that was handled
      if (fundingError?.message?.includes('already exists')) {
        // Try to extract the existing URL from error if possible
        throw new Error(`Funding source creation failed: ${fundingError.message}`);
      }
      throw fundingError;
    }

    if (!fundingSourceUrl || fundingSourceUrl.trim() === '') {
      throw new Error('Failed to create funding source in Dwolla. The funding source creation returned no URL.');
    }

    // Validate the funding source URL format
    if (!fundingSourceUrl.startsWith('https://api-sandbox.dwolla.com/funding-sources/') && 
        !fundingSourceUrl.startsWith('https://api.dwolla.com/funding-sources/')) {
      throw new Error(`Invalid funding source URL format returned: ${fundingSourceUrl}`);
    }

    console.log('Funding source created successfully:', fundingSourceUrl);

      // Update bank record with new funding source
      const { database } = await createAdminClient();
    
      await database.updateDocument(
        DATABASE_ID!,
        BANK_COLLECTION_ID!,
      bankId,
        {
          fundingSource: fundingSourceUrl,
        }
      );

    return fundingSourceUrl;
  } catch (error: any) {
    console.error('Error ensuring receiver funding source:', error);
    console.error('Error details:', {
      message: error?.message,
      body: error?.body,
      status: error?.status
    });
    throw error;
  }
}

export const ensureReceiveOnlyCustomer = async ({
  email,
  firstName,
  lastName,
  ipAddress,
}: {
  email: string;
  firstName: string;
  lastName: string;
  ipAddress: string;
}) => {
  try {
    // Get user info to get Dwolla customer ID
    const { getUserInfo } = await import('./user.action');
    // For receive-only customers, we need to create them in Dwolla
    // This is a simplified version - you may need to adjust based on your needs
    const { createDwollaCustomer } = await import('./dwolla.actions');
    
    // For receive-only customers, use minimal required fields with test values
    const dwollaCustomerUrl = await createDwollaCustomer({
      firstName,
      lastName,
      email,
      type: 'receive-only',
      address1: '123 Test St',
      city: 'Des Moines',
      state: 'IA', // Required: 2-letter state abbreviation
      postalCode: '50309',
      dateOfBirth: '', // Not required for receive-only
      ssn: '', // Not required for receive-only
    });
    
    return dwollaCustomerUrl;
  } catch (error: any) {
    console.error('Error ensuring receive-only customer:', error);
    throw error;
  }
};

export const ensureReceiveOnlyFundingSource = async ({
  dwollaCustomerUrl,
  routingNumber,
  accountNumber,
  bankAccountType,
  bankName,
}: {
  dwollaCustomerUrl: string;
  routingNumber: string;
  accountNumber: string;
  bankAccountType: 'checking' | 'savings';
  bankName: string;
}) => {
  try {
    // Extract customer ID from URL
    const customerId = dwollaCustomerUrl.split('/').pop();
    if (!customerId) {
      throw new Error('Invalid Dwolla customer URL');
    }
    
    const { createFundingSourceWithBankAccount } = await import('./dwolla.actions');
    
    const fundingSourceUrl = await createFundingSourceWithBankAccount({
      customerId,
      routingNumber,
      accountNumber,
      bankAccountType,
      name: bankName,
    });
    
    return fundingSourceUrl;
  } catch (error: any) {
    console.error('Error ensuring receive-only funding source:', error);
    throw error;
  }
};