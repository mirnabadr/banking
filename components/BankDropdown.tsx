"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { formUrlQuery, formatAmount } from "@/lib/utils";

export const BankDropdown = ({
  accounts = [],
  setValue,
  otherStyles,
}: BankDropdownProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selected, setSeclected] = useState(accounts[0] || null);

  const handleBankChange = (value: string) => {
    // Value is in format "appwriteItemId|accountId" to ensure uniqueness
    const [appwriteItemId, accountId] = value.split('|');
    const account = accounts.find((acc) => 
      acc.appwriteItemId === appwriteItemId && acc.id === accountId
    ) || accounts.find((acc) => acc.appwriteItemId === appwriteItemId);

    if (account) {
      setSeclected(account);
      const newUrl = formUrlQuery({
        params: searchParams.toString(),
        key: "id",
        value: appwriteItemId,
      });
      router.push(newUrl, { scroll: false });

      if (setValue) {
        setValue("senderBank", appwriteItemId);
      }
    }
  };

  if (!selected || accounts.length === 0) {
    return null;
  }

  // Create unique value by combining appwriteItemId and account id
  const getUniqueValue = (account: Account) => `${account.appwriteItemId}|${account.id}`;
  const getDefaultValue = () => selected ? getUniqueValue(selected) : '';

  return (
    <Select
      defaultValue={getDefaultValue()}
      onValueChange={(value) => handleBankChange(value)}
    >
      <SelectTrigger
        className={`flex w-full bg-white gap-3 md:w-[300px] ${otherStyles}`}
      >
        <Image
          src="icons/credit-card.svg"
          width={20}
          height={20}
          alt="account"
        />
        <p className="line-clamp-1 w-full text-left">{selected.name}</p>
      </SelectTrigger>
      <SelectContent
        className={`w-full bg-white md:w-[300px] ${otherStyles}`}
        align="end"
      >
        <SelectGroup>
          <SelectLabel className="py-2 font-normal text-gray-500">
            Select a bank to display
          </SelectLabel>
          {accounts.map((account: Account) => {
            const uniqueValue = getUniqueValue(account);
            return (
              <SelectItem
                key={uniqueValue}
                value={uniqueValue}
                className="cursor-pointer border-t"
              >
                <div className="flex flex-col ">
                  <p className="text-16 font-medium">{account.name}</p>
                  <p className="text-14 font-medium text-blue-600">
                    {formatAmount(account.currentBalance)}
                  </p>
                </div>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
