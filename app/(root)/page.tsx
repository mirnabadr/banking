import React from 'react'
import HeaderBox from '@/components/HeaderBox'
import TotalBalancedBox from '@/components/TotalBalancedBox'
import RightSidebar from '@/components/RightSidebar'
import { getLoggedInUser } from '@/lib/actions/user.action'

const Home = async () => {
  const loggedInUser = await getLoggedInUser();
  
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
            user={`${user?.firstName || user?.name || 'Guest'}`}  
            subtext="Manage your accounts and transactions efficiently."
           />
           < TotalBalancedBox 
            accounts={[]}
            totalBanks={1}
            totalCurrentBalance={1250.35}
           />
        </header>
        Recent Transactions
      </div>
       <RightSidebar user={user} transactions={[]} banks={[{currentBalance: 123.50}, {currentBalance: 500.50}]} />
    </section>
  )
}

export default Home
