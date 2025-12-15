import { NextResponse } from "next/server";
import { createFundingSourceWithBankAccount } from "@/lib/actions/dwolla.actions";
import { createBankAccount, getBanks } from "@/lib/actions/user.action";
import { createAdminClient } from "@/lib/appwrite";
import { encryptId } from "@/lib/utils";
import { ID } from "node-appwrite";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      customerId,
      routingNumber,
      accountNumber,
      bankAccountType,
      bankName,
      userId,
      updateExisting = false
    } = body;

    // Validate required fields
    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (!routingNumber || !accountNumber || !bankAccountType || !bankName) {
      return NextResponse.json(
        { error: "Bank account details are required (routingNumber, accountNumber, bankAccountType, bankName)" },
        { status: 400 }
      );
    }

    // Step 1: Create funding source for personal customer
    const fundingSourceUrl = await createFundingSourceWithBankAccount({
      customerId,
      routingNumber: routingNumber.trim(),
      accountNumber: accountNumber.trim(),
      bankAccountType: bankAccountType as 'checking' | 'savings',
      name: bankName.trim(),
    });

    if (!fundingSourceUrl) {
      return NextResponse.json(
        { error: "Failed to create funding source" },
        { status: 500 }
      );
    }

    // Step 2: Create or update bank record if userId provided
    let bankRecord = null;
    let sharableId = null;
    
    if (userId) {
      if (updateExisting) {
        // Find existing bank and update it
        const existingBanks = await getBanks({ userId });
        if (existingBanks && existingBanks.length > 0) {
          // Update the first bank found (or you could add logic to find the right one)
          const { database } = await createAdminClient();
          const DATABASE_ID = process.env.APPWRITE_DATABASE_ID!;
          const BANK_COLLECTION_ID = process.env.APPWRITE_BANK_COLLECTION_ID!;
          
          await database.updateDocument(
            DATABASE_ID,
            BANK_COLLECTION_ID,
            existingBanks[0].$id,
            {
              fundingSource: fundingSourceUrl,
            }
          );
          bankRecord = existingBanks[0];
          sharableId = existingBanks[0].shareableId;
        }
      } else {
        // Create new bank record
        const testAccountId = `sender-${ID.unique()}`;
        sharableId = encryptId(testAccountId);
        
        bankRecord = await createBankAccount({
          userId,
          bankId: `sender-bank-${ID.unique()}`,
          accountId: testAccountId,
          accessToken: 'test-token',
          fundingSourceUrl,
          shareableId: sharableId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      fundingSourceUrl,
      bankRecord,
      sharableId,
      message: "Funding source created successfully for personal customer",
    });
  } catch (error: any) {
    console.error("Error creating personal funding source:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to create funding source",
        details: error.body || error
      },
      { status: 500 }
    );
  }
}

