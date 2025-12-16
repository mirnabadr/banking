"use server";

import { ID, Query } from "node-appwrite";
import { createAdminClient } from "../appwrite";
import { parseStringify } from "../utils";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_TRANSACTION_COLLECTION_ID: TRANSACTION_COLLECTION_ID,
} = process.env;

export const createTransaction = async (transaction: CreateTransactionProps) => {
  try {
    const { database } = await createAdminClient();

    // Check for duplicate transaction before creating
    // Multiple strategies to prevent duplicates:
    // 1. Check by transferId if provided (most reliable)
    // 2. Check by senderBankId + receiverBankId + amount + name + recent timestamp
    try {
      let existingTransactions: any = null;
      
      // Strategy 1: If transferId is provided, check by that first (most reliable)
      if ((transaction as any).transferId) {
        const transferIdCheck = await database.listDocuments(
          DATABASE_ID!,
          TRANSACTION_COLLECTION_ID!,
          [
            Query.equal('transferId', (transaction as any).transferId),
            Query.limit(1)
          ]
        );
        
        if (transferIdCheck.total > 0) {
          console.log('⚠️  Duplicate transaction detected by transferId, skipping creation:', {
            existing: transferIdCheck.documents[0].$id,
            transferId: (transaction as any).transferId
          });
          return parseStringify(transferIdCheck.documents[0]);
        }
      }
      
      // Strategy 2: Check by combination of fields
      const queryFilters = [
        Query.equal('senderBankId', transaction.senderBankId),
        Query.equal('receiverBankId', transaction.receiverBankId),
        Query.equal('amount', transaction.amount),
      ];
      
      // Also match by name if provided to be more strict
      if (transaction.name) {
        queryFilters.push(Query.equal('name', transaction.name));
      }
      
      queryFilters.push(Query.orderDesc('$createdAt'));
      queryFilters.push(Query.limit(1)); // Limit to 1 result (most recent)

      existingTransactions = await database.listDocuments(
        DATABASE_ID!,
        TRANSACTION_COLLECTION_ID!,
        queryFilters
      );

      if (existingTransactions.total > 0) {
        const existing = existingTransactions.documents[0];
        const existingCreatedAt = new Date(existing.$createdAt).getTime();
        const now = Date.now();
        const timeDiff = now - existingCreatedAt;
        
        // Only consider it a duplicate if created within last 5 minutes
        // This prevents duplicates from rapid clicks while allowing legitimate transfers
        if (timeDiff < 5 * 60 * 1000) {
          console.log('⚠️  Duplicate transaction detected (created', Math.round(timeDiff / 1000), 'seconds ago), skipping creation:', {
            existing: existing.$id,
            existingCreatedAt: existing.$createdAt,
            existingName: existing.name,
            existingAmount: existing.amount,
            new: transaction
          });
          // Return the existing transaction instead of creating a duplicate
          return parseStringify(existing);
        }
      }
    } catch (duplicateCheckError) {
      // If duplicate check fails, log but continue with creation
      // This ensures transfers aren't blocked by query errors
      console.warn('Duplicate check failed, proceeding with transaction creation:', duplicateCheckError);
    }

    const newTransaction = await database.createDocument(
      DATABASE_ID!,
      TRANSACTION_COLLECTION_ID!,
      ID.unique(),
      {
        channel: 'online',
        category: 'Transfer',
        ...transaction
      }
    )

    return parseStringify(newTransaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
}

export const getTransactionsByBankId = async ({bankId}: getTransactionsByBankIdProps) => {
  try {
    const { database } = await createAdminClient();

    const senderTransactions = await database.listDocuments(
      DATABASE_ID!,
      TRANSACTION_COLLECTION_ID!,
      [Query.equal('senderBankId', bankId)],
    )

    const receiverTransactions = await database.listDocuments(
      DATABASE_ID!,
      TRANSACTION_COLLECTION_ID!,
      [Query.equal('receiverBankId', bankId)],
    );

    // Combine and deduplicate transactions by $id
    // A transaction can appear in both lists if senderBankId === receiverBankId (shouldn't happen but handle it)
    const allTransactionIds = new Set<string>();
    const uniqueTransactions: any[] = [];

    // Add sender transactions
    for (const tx of senderTransactions.documents) {
      if (!allTransactionIds.has(tx.$id)) {
        allTransactionIds.add(tx.$id);
        uniqueTransactions.push(tx);
      }
    }

    // Add receiver transactions (skip if already added)
    for (const tx of receiverTransactions.documents) {
      if (!allTransactionIds.has(tx.$id)) {
        allTransactionIds.add(tx.$id);
        uniqueTransactions.push(tx);
      }
    }

    const transactions = {
      total: uniqueTransactions.length,
      documents: uniqueTransactions
    }

    return parseStringify(transactions);
  } catch (error) {
    console.error('Error getting transactions by bank ID:', error);
    return parseStringify({ total: 0, documents: [] });
  }
}
