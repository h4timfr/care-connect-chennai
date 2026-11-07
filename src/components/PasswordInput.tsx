import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle. Only the input's `type` changes, so the value,
 * autocomplete hints and the element password managers attached to stay exactly the same. The
 * toggle is a real button (keyboard and screen-reader operable) that never submits the form.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<"input">, "type"> & {
    revealed?: boolean;
    onRevealedChange?: (v: boolean) => void;
  }
>(({ className, id, revealed: controlled, onRevealedChange, ...props }, ref) => {
  const { t } = useI18n();
  const [uncontrolled, setUncontrolled] = useState(false);
  const revealed = controlled ?? uncontrolled;
  const setRevealed = (next: boolean) => {
    if (controlled === undefined) setUncontrolled(next);
    onRevealedChange?.(next);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={ref}
        id={id}
        type={revealed ? "text" : "password"}
        // Keep the text exactly as typed while visible: no autocorrect or capitalisation.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="ltr"
        className="pe-11"
        {...props}
      />
      <button
        type="button"
        onClick={() => setRevealed(!revealed)}
        aria-label={revealed ? t("auth.hidePassword") : t("auth.showPassword")}
        aria-pressed={revealed}
        aria-controls={id}
        className="absolute end-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
