import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table"
  import { transactionCategoryStyles } from "@/constants"
  import { cn, formatAmount, formatDateTime, getTransactionStatus, removeSpecialCharacters } from "@/lib/utils"
  
  const CategoryBadge = ({ category }: CategoryBadgeProps) => {
    // Ensure category is not empty and format it properly
    const categoryName = category && category.trim() ? category : 'Other';
    
    const {
      borderColor,
      backgroundColor,
      textColor,
      chipBackgroundColor,
     } = transactionCategoryStyles[categoryName as keyof typeof transactionCategoryStyles] || transactionCategoryStyles.default
     
    return (
      <div className={cn('category-badge flex items-center gap-2', borderColor, chipBackgroundColor)}>
        <div className={cn('size-2 rounded-full', backgroundColor)} />
        <p className={cn('text-[12px] font-medium', textColor)}>{categoryName}</p>
      </div>
    )
  } 
  
  const TransactionsTable = ({ transactions, variant = 'default' }: TransactionTableProps) => {
    const isCompact = variant === 'compact';
    const headerPadding = isCompact ? '!px-4 !py-3' : '!px-8 !py-5';
    const cellPadding = isCompact ? '!px-4 !py-3' : '!px-8 !py-6';
    const borderColor = isCompact ? '!border-gray-200' : '!border-gray-300';
    const headerBorder = isCompact ? '!border-b !border-gray-300' : '!border-b-2 !border-gray-400';
    
    return (
      <div className="w-full overflow-x-auto">
        <Table className="w-full border-collapse">
          <TableHeader className="bg-[#f9fafb]">
            <TableRow className={headerBorder}>
              <TableHead className={`${headerPadding} text-left font-semibold text-[#344054]`}>Transaction</TableHead>
              <TableHead className={`${headerPadding} text-left font-semibold text-[#344054]`}>Amount</TableHead>
              <TableHead className={`${headerPadding} text-left font-semibold text-[#344054]`}>Status</TableHead>
              <TableHead className={`${headerPadding} text-left font-semibold text-[#344054]`}>Date</TableHead>
              <TableHead className={`${headerPadding} text-left font-semibold text-[#344054] max-md:hidden`}>Channel</TableHead>
              <TableHead className={`${headerPadding} text-left font-semibold text-[#344054] max-md:hidden`}>Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t: Transaction, index: number) => {
              const status = getTransactionStatus(new Date(t.date))
              const amount = formatAmount(t.amount)
    
              const isDebit = t.type === 'debit';
              const isCredit = t.type === 'credit';
              
              // Use category directly from transaction, format it properly
              const category = t.category && t.category.trim() 
                ? t.category.trim()
                : 'Other';
              
              // Use $id (document ID) as primary key, fallback to id + index for uniqueness
              const uniqueKey = t.$id || `${t.id}-${index}` || `transaction-${index}`;
    
              return (
                <TableRow 
                  key={uniqueKey} 
                  className={`${isDebit || amount[0] === '-' ? 'bg-[#FFFBFA]' : 'bg-[#F6FEF9]'} !border-b ${borderColor} hover:bg-opacity-80 transition-colors`}
                >
                  <TableCell className={`${cellPadding} align-middle`}>
                    <div className="flex items-center">
                      <h1 className="text-14 font-semibold text-[#344054]">
                        {removeSpecialCharacters(t.name)}
                      </h1>
                    </div>
                  </TableCell>
    
                  <TableCell className={`${cellPadding} font-semibold whitespace-nowrap align-middle ${
                    isDebit || amount[0] === '-' ?
                      'text-[#f04438]'
                      : 'text-[#039855]'
                  }`}>
                    {isDebit ? `-${amount}` : isCredit ? amount : amount}
                  </TableCell>
    
                  <TableCell className={`${cellPadding} align-middle`}>
                    <CategoryBadge category={status} /> 
                  </TableCell>
    
                  <TableCell className={`${cellPadding} whitespace-nowrap align-middle text-[#344054]`}>
                    {formatDateTime(new Date(t.date)).dateTime}
                  </TableCell>
    
                  <TableCell className={`${cellPadding} capitalize whitespace-nowrap align-middle text-[#344054]`}>
                   {t.paymentChannel}
                  </TableCell>
    
                  <TableCell className={`${cellPadding} align-middle max-md:hidden`}>
                   <CategoryBadge category={category} /> 
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }
  
  export default TransactionsTable
