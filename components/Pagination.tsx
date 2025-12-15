"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formUrlQuery } from "@/lib/utils";

export const Pagination = ({ page, totalPages }: PaginationProps) => {
  const router = useRouter();
  const searchParams = useSearchParams()!;

  const handleNavigation = (type: "prev" | "next") => {
    const pageNumber = type === "prev" ? page - 1 : page + 1;

    const newUrl = formUrlQuery({
      params: searchParams.toString(),
      key: "page",
      value: pageNumber.toString(),
    });

    router.push(newUrl, { scroll: false });
  };

  // Don't render if no pages
  if (totalPages <= 0) return null;

  return (
    <div className="flex items-center justify-between w-full py-4">
      <Button
        size="lg"
        variant="ghost"
        className="flex items-center gap-2 p-0 hover:bg-transparent disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
        onClick={() => handleNavigation("prev")}
        disabled={Number(page) <= 1}
      >
        <Image
          src="/icons/arrow-left.svg"
          alt="arrow left"
          width={20}
          height={20}
          className="mr-2"
        />
        Prev
      </Button>
      <div className="flex items-center">
        <p className="text-14 flex items-center px-2">
          {page} / {totalPages}
        </p>
      </div>
      <Button
        size="lg"
        variant="ghost"
        className="flex items-center gap-2 p-0 hover:bg-transparent disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
        onClick={() => handleNavigation("next")}
        disabled={Number(page) >= totalPages}
      >
        Next
        <Image
          src="/icons/arrow-left.svg"
          alt="arrow right"
          width={20}
          height={20}
          className="ml-2 -scale-x-100"
        />
      </Button>
    </div>
  );
};