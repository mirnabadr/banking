'use client'

import { sidebarLinks } from '@/constants'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Footer from '@/components/Footer'
import PlaidLink from './PlaidLink'

const Sidebar = ({ user }: SiderbarProps) => {
  const pathname = usePathname();

  return (
    <section className="sidebar">
      <nav className="flex flex-col gap-4">
        <Link href="/" className="mb-12 cursor-pointer flex items-center gap-2">
          <Image 
            src="/icons/logo.svg"
            width={34}
            height={34}
            alt="TechPay logo"
            className="size-[24px] max-xl:size-14"
          />
          <h1 className="sidebar-logo">TechPay</h1>
        </Link>

        {sidebarLinks.map((item) => {
          const isActive = pathname === item.route || (item.route !== '/' && pathname.startsWith(`${item.route}/`))

          return (
            <Link href={item.route} key={item.label}
              className={cn('sidebar-link', isActive && 'bg-bank-gradient')}
            >
              <div className="relative size-6">
                <Image 
                  src={item.imgURL}
                  alt={item.label}
                  fill
                  className={cn(
                    isActive ? 'brightness-0 invert-0' : 'opacity-60'
                  )}
                />
              </div>
              <p className={cn("sidebar-label", isActive ? 'text-white' : 'text-gray-700')}>
                {item.label}
              </p>
            </Link>
          )
        })}
        <PlaidLink user={user}  />
      </nav> 
      <Footer user={user} type="desktop" /> 
    </section>
  )
}

export default Sidebar