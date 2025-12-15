"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { createTransfer } from "@/lib/actions/dwolla.actions";
import { createTransaction } from "@/lib/actions/transaction.actions";
import { getBank, getBankByAccountId, ensureReceiverFundingSource } from "@/lib/actions/user.action";
import { decryptId } from "@/lib/utils";

// Verified funding source URL for Superhero Savings Bank
// This is the verified account that can send funds
const VERIFIED_FUNDING_SOURCE_URL = "https://api-sandbox.dwolla.com/funding-sources/cae64e44-0330-4903-b281-cc93026ac157";

import { BankDropdown } from "./BankDropdown";
import { Button } from "./ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(4, "Transfer note is too short"),
  amount: z.string().min(4, "Amount is too short"),
  senderBank: z.string().min(4, "Please select a valid bank account"),
  sharableId: z.string().min(8, "Please select a valid sharable Id"),
});

const PaymentTransferForm = ({ accounts }: PaymentTransferFormProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      amount: "",
      senderBank: "",
      sharableId: "",
    },
  });

  const submit = async (data: z.infer<typeof formSchema>) => {
    // Prevent double submission
    if (isLoading) {
      return;
    }
    
    setIsLoading(true);

    try {
      const receiverAccountId = decryptId(data.sharableId);
      const receiverBank = await getBankByAccountId({
        accountId: receiverAccountId,
      });
      const senderBank = await getBank({ documentId: data.senderBank });

      // Validate banks exist
      if (!senderBank) {
        throw new Error("Sender bank not found. Please try again.");
      }
      if (!receiverBank) {
        throw new Error("Receiver bank not found. Please check the account number and try again.");
      }

      // Use verified funding source as the source (Option 2: Use verified funding source directly)
      const sourceFundingSourceUrl = VERIFIED_FUNDING_SOURCE_URL;
      
      // Get receiver funding source (from receiver bank record)
      // If missing or same as source, try to create one using Plaid
      console.log('Receiver bank details:', {
        bankId: receiverBank.$id,
        accountId: receiverBank.accountId,
        fundingSource: receiverBank.fundingSource,
        accessToken: receiverBank.accessToken ? 'present' : 'missing',
        userId: receiverBank.userId
      });
      
      let destinationFundingSourceUrl = receiverBank.fundingSource;
      
      // Check if funding source is missing OR if it's the same as the source (can't transfer to self)
      const needsNewFundingSource = !destinationFundingSourceUrl || 
                                     destinationFundingSourceUrl.trim() === '' ||
                                     destinationFundingSourceUrl === sourceFundingSourceUrl;
      
      if (needsNewFundingSource) {
        if (destinationFundingSourceUrl === sourceFundingSourceUrl) {
          console.log('⚠️  Receiver bank has the SAME funding source as sender - this will fail. Creating new one...');
        } else {
          console.log('Receiver bank missing funding source, attempting to create one...');
        }
        
        try {
          // Use server action to ensure funding source exists
          destinationFundingSourceUrl = await ensureReceiverFundingSource({
            bankId: receiverBank.$id,
            accountId: receiverBank.accountId,
            accessToken: receiverBank.accessToken,
            userId: typeof receiverBank.userId === 'string' 
              ? receiverBank.userId 
              : receiverBank.userId?.$id || receiverBank.userId,
          });
          
          if (!destinationFundingSourceUrl) {
            throw new Error('Failed to create funding source');
          }
          
          // Double-check it's not the same as source
          if (destinationFundingSourceUrl === sourceFundingSourceUrl) {
            throw new Error('Created funding source is the same as sender - cannot transfer to self');
          }
          
          console.log('Successfully created funding source for receiver:', destinationFundingSourceUrl);
        } catch (fundingError: any) {
          console.error('Failed to create funding source for receiver:', fundingError);
          throw new Error(`Receiver bank does not have a valid funding source: ${fundingError?.message || 'Please ensure the receiver has connected their bank account through Plaid.'}`);
        }
      } else {
        // Validate it's not the same as source
        if (destinationFundingSourceUrl === sourceFundingSourceUrl) {
          console.log('⚠️  Receiver funding source is same as sender - forcing recreation...');
          try {
            destinationFundingSourceUrl = await ensureReceiverFundingSource({
              bankId: receiverBank.$id,
              accountId: receiverBank.accountId,
              accessToken: receiverBank.accessToken,
              userId: typeof receiverBank.userId === 'string' 
                ? receiverBank.userId 
                : receiverBank.userId?.$id || receiverBank.userId,
            });
            
            if (destinationFundingSourceUrl === sourceFundingSourceUrl) {
              throw new Error('Cannot transfer: Receiver and sender have the same funding source');
            }
          } catch (fundingError: any) {
            throw new Error(`Cannot transfer: Receiver funding source is the same as sender. ${fundingError?.message || 'Please ensure receiver has a different bank account connected.'}`);
          }
        }
      }
      
      // Validate and clean the funding source URL
      destinationFundingSourceUrl = destinationFundingSourceUrl.trim();
      
      // Validate it's a valid Dwolla funding source URL format
      if (!destinationFundingSourceUrl.startsWith('https://api-sandbox.dwolla.com/funding-sources/') && 
          !destinationFundingSourceUrl.startsWith('https://api.dwolla.com/funding-sources/')) {
        console.error('Invalid funding source URL format:', destinationFundingSourceUrl);
        throw new Error(`Receiver bank has an invalid funding source URL format: "${destinationFundingSourceUrl}". Please ensure the receiver's bank account is properly connected and has a valid Dwolla funding source.`);
      }
      
      console.log('Transfer details before sending:', {
        source: sourceFundingSourceUrl,
        destination: destinationFundingSourceUrl,
        amount: data.amount,
        sourceLength: sourceFundingSourceUrl.length,
        destinationLength: destinationFundingSourceUrl.length
      });

      const transferParams = {
        sourceFundingSourceUrl: sourceFundingSourceUrl,
        destinationFundingSourceUrl: destinationFundingSourceUrl,
        amount: data.amount,
      };
      // create transfer
      let transfer;
      try {
        console.log('Attempting to create transfer...');
        transfer = await createTransfer(transferParams);
        console.log('Transfer created successfully:', transfer);
      } catch (transferError: any) {
        console.error('Transfer creation failed:', transferError);
        console.error('Transfer error details:', {
          message: transferError?.message,
          status: transferError?.status,
          body: transferError?.body
        });
        
        // Extract more detailed error message
        if (transferError?.body?._embedded?.errors) {
          const errors = transferError.body._embedded.errors;
          const destinationError = errors.find((e: any) => e.path === '/_links/destination/href');
          if (destinationError) {
            // If destination is invalid, try to recreate the funding source
            console.log('Destination funding source is invalid, attempting to recreate...');
            try {
              const newFundingSourceUrl = await ensureReceiverFundingSource({
                bankId: receiverBank.$id,
                accountId: receiverBank.accountId,
                accessToken: receiverBank.accessToken,
                userId: typeof receiverBank.userId === 'string' 
                  ? receiverBank.userId 
                  : receiverBank.userId?.$id || receiverBank.userId,
              });
              
              if (newFundingSourceUrl && newFundingSourceUrl !== destinationFundingSourceUrl) {
                console.log('Recreated funding source, retrying transfer...');
                // Retry transfer with new funding source
                const retryParams = {
                  ...transferParams,
                  destinationFundingSourceUrl: newFundingSourceUrl,
                };
                transfer = await createTransfer(retryParams);
                console.log('Transfer succeeded after recreating funding source:', transfer);
              } else {
                throw new Error(`Invalid destination funding source. The receiver's bank account (${receiverBank.accountId}) may not be properly set up in Dwolla. Error: ${destinationError.message}`);
              }
            } catch (retryError: any) {
              throw new Error(`Invalid destination funding source. The receiver's bank account (${receiverBank.accountId}) may not be properly set up in Dwolla. Please ensure the receiver has connected their bank account and has a valid funding source. Error: ${destinationError.message}`);
            }
          } else {
            throw transferError;
          }
        } else {
          throw transferError;
        }
      }

      // create transfer transaction - only if transfer was successful
      if (!transfer) {
        throw new Error('Transfer was not created successfully');
      }

      // Handle userId - it might be a string or an object with $id
      const senderUserId = typeof senderBank.userId === 'string' 
        ? senderBank.userId 
        : senderBank.userId?.$id || senderBank.userId;
      const receiverUserId = typeof receiverBank.userId === 'string' 
        ? receiverBank.userId 
        : receiverBank.userId?.$id || receiverBank.userId;

      // Create transaction record - only create once per transfer
      // Extract transfer ID from transfer URL to use as unique identifier
      const transferId = transfer.split('/').pop() || `transfer-${Date.now()}`;
      
      const transaction = {
        name: data.name || `Transfer to ${data.email}`,
        amount: String(data.amount), // Ensure amount is a string as per schema
        senderId: senderUserId,
        senderBankId: senderBank.$id,
        receiverId: receiverUserId,
        receiverBankId: receiverBank.$id,
        email: data.email,
        // Add transfer reference to help with duplicate detection
        transferId: transferId,
      };

      console.log('Creating transaction record for transfer:', {
        transferId,
        transferUrl: transfer,
        senderBankId: senderBank.$id,
        receiverBankId: receiverBank.$id,
        amount: transaction.amount
      });
      
      // Create transaction - duplicate check is handled inside createTransaction
      const newTransaction = await createTransaction(transaction);

      if (!newTransaction) {
        console.warn('⚠️  Transaction record was not created, but transfer was successful');
      } else {
        console.log('✅ Transaction record created successfully:', {
          transactionId: newTransaction.$id,
          transferId: newTransaction.transferId || 'N/A'
        });
      }

      // Reset form and redirect only after successful transfer and transaction creation
      form.reset();
      router.push("/");
    } catch (error: any) {
      console.error("Submitting create transfer request failed: ", error);
      // Show user-friendly error message
      const errorMessage = error?.message || "Transfer failed. Please check that both banks have valid funding sources and try again.";
      alert(errorMessage);
    }

    setIsLoading(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-col">
        <FormField
          control={form.control}
          name="senderBank"
          render={() => (
            <FormItem className="border-t border-gray-200">
              <div className="payment-transfer_form-item pb-6 pt-5">
                <div className="payment-transfer_form-content">
                  <FormLabel className="text-14 font-medium text-gray-700">
                    Select Source Bank
                  </FormLabel>
                  <FormDescription className="text-12 font-normal text-gray-600">
                    Select the bank account you want to transfer funds from
                  </FormDescription>
                </div>
                <div className="flex w-full flex-col">
                  <FormControl>
                    <BankDropdown
                      accounts={accounts}
                      setValue={form.setValue}
                      otherStyles="!w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-12 text-red-500" />
                </div>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="border-t border-gray-200">
              <div className="payment-transfer_form-item pb-6 pt-5">
                <div className="payment-transfer_form-content">
                  <FormLabel className="text-14 font-medium text-gray-700">
                    Transfer Note (Optional)
                  </FormLabel>
                  <FormDescription className="text-12 font-normal text-gray-600">
                    Please provide any additional information or instructions
                    related to the transfer
                  </FormDescription>
                </div>
                <div className="flex w-full flex-col">
                  <FormControl>
                    <Textarea
                      placeholder="Write a short note here"
                      className="input-class"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-12 text-red-500" />
                </div>
              </div>
            </FormItem>
          )}
        />

        <div className="payment-transfer_form-details">
          <h2 className="text-18 font-semibold text-gray-900">
            Bank account details
          </h2>
          <p className="text-16 font-normal text-gray-600">
            Enter the bank account details of the recipient
          </p>
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="border-t border-gray-200">
              <div className="payment-transfer_form-item py-5">
                <FormLabel className="text-14 w-full max-w-[280px] font-medium text-gray-700">
                  Recipient&apos;s Email Address
                </FormLabel>
                <div className="flex w-full flex-col">
                  <FormControl>
                    <Input
                      placeholder="ex: johndoe@gmail.com"
                      className="input-class"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-12 text-red-500" />
                </div>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sharableId"
          render={({ field }) => (
            <FormItem className="border-t border-gray-200">
              <div className="payment-transfer_form-item pb-5 pt-6">
                <FormLabel className="text-14 w-full max-w-[280px] font-medium text-gray-700">
                  Receiver&apos;s Plaid Sharable Id
                </FormLabel>
                <div className="flex w-full flex-col">
                  <FormControl>
                    <Input
                      placeholder="Enter the public account number"
                      className="input-class"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-12 text-red-500" />
                </div>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem className="border-y border-gray-200">
              <div className="payment-transfer_form-item py-5">
                <FormLabel className="text-14 w-full max-w-[280px] font-medium text-gray-700">
                  Amount
                </FormLabel>
                <div className="flex w-full flex-col">
                  <FormControl>
                    <Input
                      placeholder="ex: 5.00"
                      className="input-class"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-12 text-red-500" />
                </div>
              </div>
            </FormItem>
          )}
        />

        <div className="payment-transfer_btn-box">
          <Button 
            type="submit" 
            className="payment-transfer_btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" /> &nbsp; Sending...
              </>
            ) : (
              "Transfer Funds"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default PaymentTransferForm; 