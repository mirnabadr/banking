'use server'

import { cookies, headers } from "next/headers";
import { ID, Query } from "node-appwrite";
import { extractCustomerIdFromUrl, parseStringify } from "../utils";
import { createAdminClient, createSessionClient } from "../appwrite";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID!;
const USER_COLLECTION_ID = process.env.APPWRITE_USER_COLLECTION_ID!;

export async function getUserInfo({ userId }: getUserInfoProps) {
  try {
    // Check if environment variables are set
    if (!DATABASE_ID || !USER_COLLECTION_ID) {
      console.warn('DATABASE_ID or USER_COLLECTION_ID not set. Returning basic user info.');
      return { userId, $id: userId };
    }

    const { database } = await createAdminClient();

    const user = await database.listDocuments(
      DATABASE_ID,
      USER_COLLECTION_ID,
      [Query.equal('userId', userId)]
    );

    return user.documents[0] || { userId, $id: userId };
  } catch (error) {
    console.error('Error getting user info:', error);
    // Return basic user info if database query fails
    return { userId, $id: userId };
  }
}

export async function createDwollaCustomer({ ...userData }: NewDwollaCustomerParams) {
  try {
    // TODO: Implement Dwolla customer creation
    // For now, return a placeholder URL
    // You'll need to integrate with Dwolla API here
    const dwollaCustomerUrl = `https://api-sandbox.dwolla.com/customers/${ID.unique()}`;
    return dwollaCustomerUrl;
  } catch (error) {
    console.error('Error creating Dwolla customer:', error);
    return null;
  }
}
export const signIn = async ({ email, password }: signInProps) => {
    try {
      const { account } = await createAdminClient();
      const session = await account.createEmailPasswordSession(email, password);
  
      (await cookies()).set("appwrite-session", session.secret, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: true,
      });
  
      const user = await getUserInfo({ userId: session.userId });
  
      // Return user info or at least a success indicator
      return user ? parseStringify(user) : { success: true, userId: session.userId };
    } catch (error) {
      console.error('Error signing in:', error);
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
      })
  
      if(!dwollaCustomerUrl) throw new Error('Error creating Dwolla customer')
  
      const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

      // Only create database document if environment variables are set
      let newUser;
      if (DATABASE_ID && USER_COLLECTION_ID) {
        newUser = await database.createDocument(
          DATABASE_ID, 
          USER_COLLECTION_ID,
          ID.unique(),
          {
            ...userData,
            userId: newUserAccount.$id,
            dwollaCustomerId,
            dwollaCustomerUrl
          }
        )
      } else {
        console.warn('DATABASE_ID or USER_COLLECTION_ID not set. Skipping database document creation.');
        // Return a basic user object
        newUser = {
          ...userData,
          userId: newUserAccount.$id,
          dwollaCustomerId,
          dwollaCustomerUrl,
          $id: newUserAccount.$id
        };
      }
  
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
      const accountInfo = await account.get();
  
      const user: any = await getUserInfo({ userId: accountInfo.$id});
  
      // If user info from database is missing, use account info
      if (user && (!user.email || !user.firstName)) {
        return parseStringify({
          ...user,
          email: user.email || accountInfo.email,
          firstName: user.firstName || accountInfo.name?.split(' ')[0] || '',
          lastName: user.lastName || accountInfo.name?.split(' ').slice(1).join(' ') || '',
          name: user.name || accountInfo.name || accountInfo.email?.split('@')[0] || 'Guest',
          userId: accountInfo.$id,
          $id: user.$id || accountInfo.$id,
        });
      }
  
      return parseStringify(user || {
        userId: accountInfo.$id,
        $id: accountInfo.$id,
        email: accountInfo.email,
        firstName: accountInfo.name?.split(' ')[0] || '',
        lastName: accountInfo.name?.split(' ').slice(1).join(' ') || '',
        name: accountInfo.name || accountInfo.email?.split('@')[0] || 'Guest',
      });
    } catch (error) {
      console.log(error)
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
  