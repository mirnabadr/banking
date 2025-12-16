import React from 'react'
import HeaderBox from '@/components/HeaderBox'
import TotalBalancedBox from '@/components/TotalBalancedBox'
import RightSidebar from '@/components/RightSidebar'
import { getLoggedInUser } from '@/lib/actions/user.action'
import { getAccount, getAccounts } from '@/lib/actions/bank.actions'
import RecentTransactions from '@/components/RecentTransactions'

export const dynamic = 'force-dynamic';

const Home = async ({ searchParams }: SearchParamProps) => {
    const resolvedSearchParams = await searchParams;
    const id = resolvedSearchParams?.id as string;
    const page = resolvedSearchParams?.page as string;
    const currentPage = Number(page) || 1;
    
    const loggedInUser = await getLoggedInUser();
    
    // Redirect to sign-in if user is not logged in
    if (!loggedInUser || !loggedInUser.$id) {
      return (
        <section className="home">
          <div className="home-content">
            <header className="Home Header">
              <HeaderBox  
                type="greeting"
                title="Welcome"
                user="Guest"  
                subtext="Please sign in to access your accounts."
              />
            </header>
          </div>
        </section>
      );
    }
    
    const accounts = await getAccounts({ 
      userId: loggedInUser.$id 
    })
  
    if(!accounts || !accounts.data || accounts.data.length === 0) {
      return (
        <section className="home">
          <div className="home-content">
            <header className="Home Header">
              <HeaderBox  
                type="greeting"
                title="Welcome"
                user={`${loggedInUser?.firstName || loggedInUser?.name || 'Guest'}`}  
                subtext="Connect your bank account to get started."
              />
            </header>
          </div>
        </section>
      );
    }
    
    const accountsData = accounts.data;
    const appwriteItemId = id || accountsData[0]?.appwriteItemId;
  
    const account = appwriteItemId ? await getAccount({ appwriteItemId }) : null;


  
  // Format user data to match User type
  const user: User = loggedInUser ? {
    ...loggedInUser,
    name: loggedInUser.firstName && loggedInUser.lastName 
      ? `${loggedInUser.firstName} ${loggedInUser.lastName}`
      : loggedInUser.email?.split('@')[0] || 'Guest',
    firstName: loggedInUser.firstName || '',
    lastName: loggedInUser.lastName || '',
    email: loggedInUser.email || '',
  } as User : {
    $id: '',
    userId: '',
    email: '',
    firstName: '',
    lastName: '',
    name: 'Guest',
    dwollaCustomerUrl: '',
    dwollaCustomerId: '',
    address1: '',
    city: '',
    state: '',
    postalCode: '',
    dateOfBirth: '',
    ssn: '',
  };

  return (
    <section className="home">
      <div className="home-content">
        <header className="Home Header">
           < HeaderBox  
            type="greeting"
            title="Welcome"
            user={`${loggedInUser?.firstName || loggedInUser?.name || 'Guest'}`}  
            subtext="Manage your accounts and transactions efficiently."
           />
           < TotalBalancedBox 
            accounts={accountsData}
            totalBanks={accounts?.totalBanks}
            totalCurrentBalance={accounts?.totalCurrentBalance}
           
           />
        </header>
        <RecentTransactions 
        accounts={accountsData}
        transactions={account?.transactions}
        appwriteItemId={appwriteItemId}
        page={currentPage}
        />
      </div>
       <RightSidebar user={loggedInUser} 
       transactions={account?.transactions} 
       banks={accountsData?.slice(0, 2)} /> 
    </section>
  )
}

export default Home
