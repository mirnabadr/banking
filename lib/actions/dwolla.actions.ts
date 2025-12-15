"use server";

import { Client } from "dwolla-v2";

const getEnvironment = (): "production" | "sandbox" => {
  const environment = process.env.DWOLLA_ENV as string;

  switch (environment) {
    case "sandbox":
      return "sandbox";
    case "production":
      return "production";
    default:
      throw new Error(
        "Dwolla environment should either be set to `sandbox` or `production`"
      );
  }
};

const dwollaClient = new Client({
  environment: getEnvironment(),
  key: process.env.DWOLLA_KEY as string,
  secret: process.env.DWOLLA_SECRET as string,
});

// Create a Dwolla Funding Source using a Plaid Processor Token
export const createFundingSource = async (
  options: CreateFundingSourceOptions
) => {
  try {
    const response = await dwollaClient.post(
      `customers/${options.customerId}/funding-sources`,
      {
        name: options.fundingSourceName,
        plaidToken: options.plaidToken,
      }
    );
    
    const location = response.headers.get("location");
    
    if (!location) {
      throw new Error("No location header returned from Dwolla when creating funding source");
    }
    
    console.log("Funding source created successfully:", location);
    return location;
  } catch (err: any) {
    console.error("Creating a Funding Source Failed: ", err);
    
    // Handle duplicate funding source error - funding source already exists
    if (err.body && err.body.code === 'DuplicateResource' && err.body._links && err.body._links.about) {
      const existingFundingSourceUrl = err.body._links.about.href;
      console.log("Funding source already exists, using existing:", existingFundingSourceUrl);
      return existingFundingSourceUrl;
    }
    
    // Re-throw the error so caller can handle it
    throw err;
  }
};

export const createOnDemandAuthorization = async () => {
  try {
    const onDemandAuthorization = await dwollaClient.post(
      "on-demand-authorizations"
    );
    const authLink = onDemandAuthorization.body._links;
    return authLink;
  } catch (err) {
    console.error("Creating an On Demand Authorization Failed: ", err);
  }
};

export const createDwollaCustomer = async (
  newCustomer: NewDwollaCustomerParams
) => {
  try {
    return await dwollaClient
      .post("customers", newCustomer)
      .then((res) => res.headers.get("location"));
  } catch (err: any) {
    // Handle duplicate customer error
    if (err.body && err.body._embedded && err.body._embedded.errors) {
      const duplicateError = err.body._embedded.errors.find(
        (error: any) => error.code === 'Duplicate' && error.path === '/email'
      );
      
      if (duplicateError && duplicateError._links && duplicateError._links.about) {
        // Customer already exists, return the existing customer URL
        const existingCustomerUrl = duplicateError._links.about.href;
        console.log("Customer already exists, using existing customer:", existingCustomerUrl);
        return existingCustomerUrl;
      }
    }
    
    console.error("Creating a Dwolla Customer Failed: ", err);
    // Re-throw the error so it can be handled by the caller
    throw err;
  }
};

export const createTransfer = async ({
  sourceFundingSourceUrl,
  destinationFundingSourceUrl,
  amount,
}: TransferParams) => {
  try {
    // Validate URLs are present and properly formatted
    if (!sourceFundingSourceUrl || !destinationFundingSourceUrl) {
      throw new Error("Source or destination funding source URL is missing");
    }

    // Validate URL format
    if (!sourceFundingSourceUrl.startsWith('https://api') || !destinationFundingSourceUrl.startsWith('https://api')) {
      throw new Error("Invalid funding source URL format. URLs must start with https://api");
    }

    const requestBody = {
      _links: {
        source: {
          href: sourceFundingSourceUrl.trim(),
        },
        destination: {
          href: destinationFundingSourceUrl.trim(),
        },
      },
      amount: {
        currency: "USD",
        value: String(amount),
      },
    };
    
    console.log('Creating transfer with request body:', JSON.stringify(requestBody, null, 2));
    console.log('Funding source URLs:', {
      source: sourceFundingSourceUrl,
      destination: destinationFundingSourceUrl,
      sourceValid: sourceFundingSourceUrl.startsWith('https://api'),
      destinationValid: destinationFundingSourceUrl.startsWith('https://api')
    });
    
    const response = await dwollaClient.post("transfers", requestBody);
    const location = response.headers.get("location");
    
    console.log('Transfer created successfully, location:', location);
    return location;
  } catch (err: any) {
    console.error("Transfer fund failed: ", err);
    // Log detailed error information
    if (err.body) {
      console.error("Dwolla error body: ", JSON.stringify(err.body, null, 2));
    }
    if (err.status) {
      console.error("Dwolla error status: ", err.status);
    }
    // Create a more user-friendly error message
    if (err.body && err.body._embedded && err.body._embedded.errors) {
      const errors = err.body._embedded.errors;
      const destinationError = errors.find((e: any) => e.path === '/_links/destination/href');
      if (destinationError) {
        throw new Error(`Invalid destination funding source: ${destinationError.message}. The receiver's bank account may not be properly set up in Dwolla.`);
      }
    }
    // Re-throw with more context
    throw err;
  }
};

export const addFundingSource = async ({
  dwollaCustomerId,
  processorToken,
  bankName,
}: AddFundingSourceParams) => {
  try {
    console.log("addFundingSource called:", {
      dwollaCustomerId,
      bankName,
      hasProcessorToken: !!processorToken
    });

    // create dwolla auth link
    const dwollaAuthLinks = await createOnDemandAuthorization();
    
    if (!dwollaAuthLinks) {
      throw new Error("Failed to create Dwolla authorization links");
    }

    // add funding source to the dwolla customer & get the funding source url
    const fundingSourceOptions = {
      customerId: dwollaCustomerId,
      fundingSourceName: bankName,
      plaidToken: processorToken,
      _links: dwollaAuthLinks,
    };
    
    const fundingSourceUrl = await createFundingSource(fundingSourceOptions);
    
    if (!fundingSourceUrl) {
      throw new Error("Failed to create funding source - no URL returned");
    }
    
    console.log("Funding source added successfully:", fundingSourceUrl);
    return fundingSourceUrl;
  } catch (err: any) {
    console.error("addFundingSource failed: ", err);
    // Re-throw with more context
    throw new Error(`Failed to add funding source: ${err?.message || 'Unknown error'}`);
  }
};

// Create funding source using bank account details (routing/account numbers)
export const createFundingSourceWithBankAccount = async ({
  customerId,
  routingNumber,
  accountNumber,
  bankAccountType,
  name,
}: {
  customerId: string;
  routingNumber: string;
  accountNumber: string;
  bankAccountType: 'checking' | 'savings';
  name: string;
}) => {
  try {
    console.log("createFundingSourceWithBankAccount called:", {
      customerId,
      routingNumber,
      accountNumber: accountNumber.substring(0, 4) + '****',
      bankAccountType,
      name
    });

    const response = await dwollaClient.post(
      `customers/${customerId}/funding-sources`,
      {
        routingNumber: routingNumber.trim(),
        accountNumber: accountNumber.trim(),
        bankAccountType: bankAccountType,
        name: name.trim(),
      }
    );
    
    const location = response.headers.get("location");
    
    if (!location) {
      throw new Error("No location header returned from Dwolla when creating funding source");
    }
    
    console.log("Funding source created successfully:", location);
    return location;
  } catch (err: any) {
    console.error("Creating a Funding Source with Bank Account Failed: ", err);
    
    // Handle duplicate funding source error
    if (err.body && err.body.code === 'DuplicateResource' && err.body._links && err.body._links.about) {
      const existingFundingSourceUrl = err.body._links.about.href;
      console.log("Funding source already exists, using existing:", existingFundingSourceUrl);
      return existingFundingSourceUrl;
    }
    
    // Re-throw the error so caller can handle it
    throw err;
  }
};