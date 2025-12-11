'use client'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { sidebarLinks } from "@/constants"
import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import Footer from "@/components/Footer"

const MobileNav = ({ user }: MobileNavProps) => {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button 
          className="cursor-pointer flex items-center justify-center" 
          aria-label="Open menu"
          type="button"
        >
          <Image
            src="/icons/hamburger.svg"
            width={30}
            height={30}
            alt="menu"
            className="cursor-pointer"
          />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="border-none bg-white">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <Link href="/" className="cursor-pointer flex items-center gap-1 px-4">
          <Image 
            src="/icons/logo.svg"
            width={34}
            height={34}
            alt="TechPay logo"
          />
          <h1 className="text-[26px] leading-[32px] font-ibm-plex-serif font-bold text-gray-900">TechPay</h1>
        </Link>
        <div className="mobilenav-sheet">
          <nav className="flex h-full flex-col gap-6 pt-16 text-white">
            {sidebarLinks.map((item) => {
              const isActive = pathname === item.route || (item.route !== '/' && pathname.startsWith(`${item.route}/`))

              return (
                <SheetClose asChild key={item.route}>
                  <Link href={item.route}
                    className={cn('mobilenav-sheet_close w-full', isActive && 'bg-bank-gradient')}
                  >
                    <Image 
                      src={item.imgURL}
                      alt={item.label}
                      width={20}
                      height={20}
                      className={cn(
                        isActive ? 'brightness-0 invert-0' : 'opacity-60'
                      )}
                    />
                    <p className={cn("text-[16px] leading-[24px] font-semibold text-gray-700", isActive && "text-white")}>
                      {item.label}
                    </p>
                  </Link>
                </SheetClose>
                 
              )
            })}
          </nav>
          <Footer user={user} type="mobile" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default MobileNav