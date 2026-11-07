import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { controlClassName } from "@/components/ui/input";

/**
 * A native <select> styled like the other form controls. Native is deliberate: phones show their
 * own accessible picker, and keyboard/screen-reader behaviour is the platform's. The browser draws
 * the open menu itself, so its colours come from `color-scheme` and the explicit option colours
 * in styles.css, never from an inherited (possibly light-on-light) text colour.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select"> & { selectClassName?: string }
>(({ className, selectClassName, children, ...props }, ref) => (
  <div className={cn("relative", className)}>
    <select
      ref={ref}
      className={cn(
        controlClassName,
        "cursor-pointer appearance-none truncate pe-9",
        selectClassName,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden
    />
  </div>
));
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
