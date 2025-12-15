"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }
>(({ indicatorClassName, className, value = 0, ...props }, ref) => { 
  const progressValue = Math.max(0, Math.min(100, Number(value) || 0));
  
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={progressValue}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full transition-all', indicatorClassName || 'bg-primary')}
        style={{ width: `${progressValue}%` }}
      />
    </ProgressPrimitive.Root>
  );
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }

