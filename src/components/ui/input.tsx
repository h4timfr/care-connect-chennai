import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared look for text inputs and native selects: an explicit card background and foreground
 * (never transparent, so text never inherits a colour the browser's own UI can't show), a
 * visible border, and an indigo focus ring that is distinct from the teal brand colour.
 */
export const controlClassName =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          controlClassName,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
