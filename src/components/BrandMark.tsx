import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const SIZE = {
  sm: { box: "h-8 w-8 rounded-lg", icon: "h-4 w-4", spark: "h-1.5 w-1.5" },
  md: { box: "h-9 w-9 rounded-xl", icon: "h-[18px] w-[18px]", spark: "h-1.5 w-1.5" },
  lg: { box: "h-12 w-12 rounded-xl", icon: "h-6 w-6", spark: "h-2 w-2" },
} as const;

/** Teal field with a small indigo datum — brand, not a generic gradient tile. */
export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: keyof typeof SIZE;
}) {
  const s = SIZE[size];
  return (
    <span
      className={cn(
        "relative grid place-items-center bg-primary text-primary-foreground shadow-sm",
        s.box,
        className,
      )}
    >
      <Stethoscope className={s.icon} aria-hidden />
      <span
        className={cn("absolute end-1 top-1 rounded-[2px] bg-highlight", s.spark)}
        aria-hidden
      />
    </span>
  );
}

export function SkipToContent() {
  const { t } = useI18n();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {t("nav.skipToContent")}
    </a>
  );
}
