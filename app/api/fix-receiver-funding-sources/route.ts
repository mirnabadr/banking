import { NextResponse } from "next/server";
import { getBankByAccountId, ensureReceiverFundingSource, getUserInfo } from "@/lib/actions/user.action";
import { decryptId } from "@/lib/utils";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shareableId, forceUpdate, newFundingSourceUrl } = body;

    if (!shareableId) {
      return NextResponse.json(
        { error: "shareableId is required" },
        { status: 400 }
      );
    }

    // Decrypt shareableId to get accountId
    const receiverAccountId = decryptId(shareableId);
    console.log('Decrypted accountId:', receiverAccountId);

    // If forceUpdate and newFundingSourceUrl provided, update directly
    if (forceUpdate && newFundingSourceUrl) {
      const receiverBank = await getBankByAccountId({
        accountId: receiverAccountId,
      });

      if (!receiverBank) {
        return NextResponse.json(
          { error: "Receiver bank not found" },
          { status: 404 }
        );
      }

      const { database } = await createAdminClient();
      await database.updateDocument(
        DATABASE_ID!,
        BANK_COLLECTION_ID!,
        receiverBank.$id,
        {
          fundingSource: newFundingSourceUrl,
        }
      );

      return NextResponse.json({
        success: true,
        action: 'updated',
        bank: {
          bankId: receiverBank.$id,
          accountId: receiverBank.accountId,
          fundingSource: newFundingSourceUrl,
        },
        message: 'Funding source updated successfully'
      });
    }

    // Get receiver bank
    const receiverBank = await getBankByAccountId({
      accountId: receiverAccountId,
    });

    if (!receiverBank) {
      return NextResponse.json(
        { error: "Receiver bank not found for this shareableId" },
        { status: 404 }
      );
    }

    console.log('Receiver bank found:', {
      bankId: receiverBank.$id,
      accountId: receiverBank.accountId,
      hasFundingSource: !!receiverBank.fundingSource,
      fundingSource: receiverBank.fundingSource,
      hasAccessToken: !!receiverBank.accessToken,
      userId: receiverBank.userId
    });

    // Check if funding source exists and is valid
    // Also check if it's the same as the verified sender funding source (can't transfer to self)
    const VERIFIED_SENDER_FUNDING_SOURCE = "https://api-sandbox.dwolla.com/funding-sources/cae64e44-0330-4903-b281-cc93026ac157";
    
    let fundingSourceUrl = receiverBank.fundingSource;
    let action = 'none';

    // Force recreation if funding source is same as sender
    const isSameAsSender = fundingSourceUrl === VERIFIED_SENDER_FUNDING_SOURCE;
    
    if (!fundingSourceUrl || fundingSourceUrl.trim() === '' || isSameAsSender) {
      if (isSameAsSender) {
        console.log('⚠️  Receiver funding source is the SAME as sender - forcing recreation...');
      }
      console.log('Funding source missing, attempting to create...');
      
      // Check if we can create it (need valid access token and Dwolla customer ID)
      if (!receiverBank.accessToken || receiverBank.accessToken === 'test-token') {
        return NextResponse.json({
          success: false,
          error: "Cannot create funding source: Receiver bank does not have a valid Plaid access token. The bank account needs to be connected through Plaid.",
          bank: {
            bankId: receiverBank.$id,
            accountId: receiverBank.accountId,
            hasAccessToken: false,
          }
        }, { status: 400 });
      }

      const receiverUserId = typeof receiverBank.userId === 'string' 
        ? receiverBank.userId 
        : receiverBank.userId?.$id || receiverBank.userId;

      if (!receiverUserId) {
        return NextResponse.json({
          success: false,
          error: "Cannot create funding source: Receiver bank does not have a userId",
        }, { status: 400 });
      }

      // Check if user has Dwolla customer ID
      const receiverUser = await getUserInfo({ userId: receiverUserId });
      
      if (!receiverUser || !receiverUser.dwollaCustomerId) {
        return NextResponse.json({
          success: false,
          error: "Cannot create funding source: Receiver user does not have a Dwolla customer ID. Please ensure the receiver has completed their account setup.",
          bank: {
            bankId: receiverBank.$id,
            accountId: receiverBank.accountId,
            userId: receiverUserId,
            hasDwollaCustomerId: false,
          }
        }, { status: 400 });
      }

      // Create funding source
      try {
        fundingSourceUrl = await ensureReceiverFundingSource({
          bankId: receiverBank.$id,
          accountId: receiverBank.accountId,
          accessToken: receiverBank.accessToken,
          userId: receiverUserId,
        });
        
        // Verify it's not the same as sender
        if (fundingSourceUrl === VERIFIED_SENDER_FUNDING_SOURCE) {
          return NextResponse.json({
            success: false,
            error: "Created funding source is the same as sender. This usually means the receiver's Plaid account is linked to the same Dwolla customer as the sender. Please ensure receiver has a different bank account.",
            fundingSource: fundingSourceUrl
          }, { status: 400 });
        }
        
        action = isSameAsSender ? 'recreated' : 'created';
        console.log('Funding source created successfully:', fundingSourceUrl);
      } catch (error: any) {
        console.error('Failed to create funding source:', error);
        return NextResponse.json({
          success: false,
          error: `Failed to create funding source: ${error?.message || 'Unknown error'}`,
          details: error
        }, { status: 500 });
      }
    } else {
      // Validate existing funding source URL format
      if (!fundingSourceUrl.startsWith('https://api-sandbox.dwolla.com/funding-sources/') && 
          !fundingSourceUrl.startsWith('https://api.dwolla.com/funding-sources/')) {
        return NextResponse.json({
          success: false,
          error: `Invalid funding source URL format: ${fundingSourceUrl}`,
          fundingSource: fundingSourceUrl
        }, { status: 400 });
      }
      
      // Check if it's same as sender
      if (fundingSourceUrl === VERIFIED_SENDER_FUNDING_SOURCE) {
        return NextResponse.json({
          success: false,
          error: "Receiver funding source is the same as sender. Cannot transfer to self. Please fix this by creating a new funding source for the receiver.",
          fundingSource: fundingSourceUrl,
          needsFix: true
        }, { status: 400 });
      }
      
      action = 'validated';
    }

    return NextResponse.json({
      success: true,
      action,
      bank: {
        bankId: receiverBank.$id,
        accountId: receiverBank.accountId,
        fundingSource: fundingSourceUrl,
      },
      message: action === 'created' 
        ? 'Funding source created successfully' 
        : 'Funding source is valid'
    });
  } catch (error: any) {
    console.error("Error fixing receiver funding source:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || "Failed to fix receiver funding source",
        details: error
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check all receiver banks
export async function GET(request: Request) {
  try {
    const { database } = await createAdminClient();
    const url = new URL(request.url);
    const shareableId = url.searchParams.get('shareableId');

    if (shareableId) {
      // Check specific bank
      const receiverAccountId = decryptId(shareableId);
      const receiverBank = await getBankByAccountId({
        accountId: receiverAccountId,
      });

      if (!receiverBank) {
        return NextResponse.json(
          { error: "Receiver bank not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        bank: {
          bankId: receiverBank.$id,
          accountId: receiverBank.accountId,
          hasFundingSource: !!receiverBank.fundingSource,
          fundingSource: receiverBank.fundingSource || null,
          hasAccessToken: !!receiverBank.accessToken && receiverBank.accessToken !== 'test-token',
          userId: receiverBank.userId,
        }
      });
    }

    // Get all banks
    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      []
    );

    const banksWithStatus = banks.documents.map((bank: any) => ({
      bankId: bank.$id,
      accountId: bank.accountId,
      hasFundingSource: !!bank.fundingSource,
      fundingSource: bank.fundingSource || null,
      hasAccessToken: !!bank.accessToken && bank.accessToken !== 'test-token',
      userId: bank.userId,
    }));

    return NextResponse.json({
      total: banks.total,
      banks: banksWithStatus
    });
  } catch (error: any) {
    console.error("Error checking receiver banks:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check receiver banks" },
      { status: 500 }
    );
  }
}

