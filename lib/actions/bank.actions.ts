"use server";

import {
  ACHClass,
  CountryCode,
  TransferAuthorizationCreateRequest,
  TransferCreateRequest,
  TransferNetwork,
  TransferType,
} from "plaid";

import { plaidClient } from "../plaid";
import { parseStringify, encryptId } from "../utils";

 import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.action";  

// Get multiple bank accounts
export const getAccounts = async ({ userId }: getAccountsProps) => {
  try {
    // get banks from db
    const banks = await getBanks({ userId });

    if (!banks || banks.length === 0) {
      return parseStringify({ data: [], totalBanks: 0, totalCurrentBalance: 0 });
    }

    const accountsResults = await Promise.all(
      banks.map(async (bank: Bank) => {
        if (!bank || !bank.accessToken) {
          return null;
        }

        try {
          // get each account info from plaid
          const accountsResponse = await plaidClient.accountsGet({
            access_token: bank.accessToken,
          });
          
          if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
            return null;
          }

          // get institution info from plaid
          const institution = await getInstitution({
            institutionId: accountsResponse.data.item.institution_id!,
          });

          if (!institution) {
            return null;
          }

          // Return all accounts for this bank, not just the first one
          // Each account should have its own shareableId based on its accountId
          return accountsResponse.data.accounts.map((accountData: any) => ({
            id: accountData.account_id,
            availableBalance: accountData.balances.available!,
            currentBalance: accountData.balances.current!,
            institutionId: institution.institution_id,
            name: accountData.name,
            officialName: accountData.official_name,
            mask: accountData.mask!,
            type: accountData.type as string,
            subtype: accountData.subtype! as string,
            appwriteItemId: bank.$id,
            shareableId: encryptId(accountData.account_id),
          }));
        } catch (error) {
          console.error("Error getting account for bank:", bank.$id, error);
          return null;
        }
      })
    );

    // Flatten the array of arrays and filter out nulls
    const validAccounts = accountsResults
      .filter(result => result !== null)
      .flat();

    const totalBanks = validAccounts.length;
    const totalCurrentBalance = validAccounts.reduce((total, account) => {
      return total + account.currentBalance;
    }, 0);

    return parseStringify({ data: validAccounts, totalBanks, totalCurrentBalance });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
    return parseStringify({ data: [], totalBanks: 0, totalCurrentBalance: 0 });
  }
};

// Get one bank account
export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    if (!appwriteItemId) {
      console.error("appwriteItemId is required");
      return null;
    }

    // get bank from db
    const bank = await getBank({ documentId: appwriteItemId });

    if (!bank || !bank.accessToken) {
      console.error("Bank not found or missing accessToken for:", appwriteItemId);
      return null;
    }

    // get account info from plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });
    
    if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
      return null;
    }
    
    const accountData = accountsResponse.data.accounts[0];

    // get transfer transactions from appwrite
    let transferTransactions: any[] = [];
    try {
      const transferTransactionsData = await getTransactionsByBankId({ 
        bankId: bank.$id,
      });
      
      // Map transfer transactions and ensure unique IDs (deduplicate)
      const seenTransferIds = new Set<string>();
      transferTransactions = transferTransactionsData.documents
        .filter((transferData: Transaction) => {
          // Filter out duplicates by $id
          const txId = transferData.$id;
          if (seenTransferIds.has(txId)) {
            console.log('⚠️  Skipping duplicate transfer transaction:', txId);
            return false;
          }
          seenTransferIds.add(txId);
          return true;
        })
        .map((transferData: Transaction) => ({
          id: transferData.$id, // Use $id as the unique identifier
          $id: transferData.$id, // Also include $id for React key
          name: transferData.name!,
          amount: transferData.amount!,
          date: transferData.$createdAt,
          paymentChannel: transferData.channel,
          category: transferData.category,
          type: transferData.senderBankId === bank.$id ? "debit" : "credit",
        }));
    } catch (error) {
      console.log("Transfer transactions not available:", error);
    }

    // get institution info from plaid
    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    if (!institution) {
      console.error("Institution not found");
      return null;
    }

    const transactionsData = await getTransactions({
      accessToken: bank.accessToken,
      accountId: accountData.account_id,
    });

    // parseStringify returns a deep clone, so transactionsData is already an array
    const transactions = Array.isArray(transactionsData) ? transactionsData : [];

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available!,
      currentBalance: accountData.balances.current!,
      institutionId: institution.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask!,
      type: accountData.type as string,
      subtype: accountData.subtype! as string,
      appwriteItemId: bank.$id,
      shareableId: encryptId(accountData.account_id),
    };

    // Deduplicate transactions by id before combining
    // Use a Map to ensure uniqueness by transaction id
    const transactionMap = new Map<string, any>();
    
    // Add Plaid transactions
    transactions.forEach((tx: any) => {
      if (tx.id && !transactionMap.has(tx.id)) {
        transactionMap.set(tx.id, tx);
      }
    });
    
    // Add transfer transactions (skip duplicates)
    transferTransactions.forEach((tx: any) => {
      // Use $id as the unique identifier for transfer transactions
      const txId = tx.id || tx.$id;
      if (txId && !transactionMap.has(txId)) {
        transactionMap.set(txId, tx);
      }
    });
    
    // Convert map back to array and sort by date (most recent first)
    const allTransactions = Array.from(transactionMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
    return null;
  }
};

// Get bank info
export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const institution = institutionResponse.data.institution;

    return parseStringify(institution);
  } catch (error) {
    console.error("An error occurred while getting the institution:", error);
    return null;
  }
};

// Get transactions
export const getTransactions = async ({
  accessToken,
  accountId,
}: getTransactionsProps) => {
  let transactions: any = [];
  let offset = 0;
  const count = 100; // Reduced from 500 to be safer

  try {
    if (!accessToken) {
      console.error("Access token is required");
      return parseStringify([]);
    }

    // Get transactions from the last 30 days
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Format dates as YYYY-MM-DD (ensure we're using the correct timezone)
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    // Build request parameters - start without account_ids to avoid 400 errors
    // We'll filter by account_id client-side if needed
    const requestParams: any = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: count,
        offset: offset,
      },
    };

    // Get all transactions with pagination
    let hasMore = true;
    while (hasMore) {
      try {
        const response = await plaidClient.transactionsGet(requestParams);
        const data = response.data;

        // Map transactions to our format
        let newTransactions = data.transactions.map((transaction: any) => {
          // Determine if transaction is debit or credit based on amount direction
          // In Plaid, positive amounts are typically debits (money out) for checking accounts
          // Negative amounts or specific categories indicate credits (money in)
          const amount = transaction.amount;
          const isCredit = amount < 0 || 
            transaction.category?.some((cat: string) => 
              cat.toLowerCase().includes('deposit') || 
              cat.toLowerCase().includes('credit') ||
              cat.toLowerCase().includes('refund')
            ) || 
            transaction.name?.toLowerCase().includes('deposit') ||
            transaction.name?.toLowerCase().includes('credit') ||
            transaction.name?.toLowerCase().includes('refund');
          
          // Extract and format category from Plaid
          // Plaid categories are arrays like ["Food and Drink", "Restaurants"]
          let category = "";
          if (transaction.category && Array.isArray(transaction.category) && transaction.category.length > 0) {
            // Use the primary category (first element) - this is the main category
            category = transaction.category[0];
          } else if (typeof transaction.category === 'string') {
            // Sometimes category might be a string directly
            category = transaction.category;
          } else {
            // Try to infer from transaction name or merchant
            const name = (transaction.name || "").toLowerCase();
            if (name.includes('uber') || name.includes('lyft') || name.includes('airline') || name.includes('hotel') || name.includes('travel')) {
              category = "Travel";
            } else if (name.includes('mcdonalds') || name.includes('starbucks') || name.includes('restaurant') || name.includes('food') || name.includes('grocery')) {
              category = "Food and Drink";
            } else if (name.includes('payment') || name.includes('credit card')) {
              category = "Payment";
            } else if (name.includes('transfer') || name.includes('deposit')) {
              category = "Transfer";
            } else {
              category = "Other";
            }
          }
          
          return {
            id: transaction.transaction_id,
            name: transaction.name,
            paymentChannel: transaction.payment_channel,
            type: isCredit ? 'credit' : 'debit',
            accountId: transaction.account_id,
            amount: Math.abs(amount), // Store absolute value
            pending: transaction.pending,
            category: category,
            date: transaction.date,
            image: transaction.logo_url,
          };
        });

        // Filter by accountId if provided (client-side filtering)
        if (accountId) {
          newTransactions = newTransactions.filter((t: any) => t.accountId === accountId);
        }

        transactions = [...transactions, ...newTransactions];

        // Check if we've fetched all transactions
        if (transactions.length >= data.total_transactions || newTransactions.length < count || data.transactions.length < count) {
          hasMore = false;
        } else {
          offset += count;
          requestParams.options.offset = offset;
        }
      } catch (apiError: any) {
        // Silently handle errors and stop fetching
        hasMore = false;
      }
    }

    return parseStringify(transactions);
  } catch (error: any) {
    // Return empty array on error
    return parseStringify([]);
  }
};