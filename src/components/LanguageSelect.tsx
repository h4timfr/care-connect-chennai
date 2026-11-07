import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES, useI18n, type Language } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** UI language picker. Each language is listed in its own script, as people look for it. */
export function LanguageSelect({ showLabel = false }: { showLabel?: boolean }) {
  const { lang, info, dir, t } = useI18n();
  const { changeLanguage } = useApp();

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={showLabel ? "sm" : "icon"}
          aria-label={`${t("language.choose")}: ${info.nativeName}`}
          className={cn(showLabel && "gap-1.5 px-2.5")}
        >
          <Globe className="h-[1.2rem] w-[1.2rem]" aria-hidden />
          {showLabel ? (
            <span lang={info.locale} className="text-sm font-medium">
              {info.nativeName}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("language.label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((l) => {
          const selected = l.code === lang;
          return (
            <DropdownMenuItem
              key={l.code}
              role="menuitemradio"
              aria-checked={selected}
              onSelect={() => void changeLanguage(l.code as Language)}
              className="flex items-center gap-3"
            >
              <span className="flex w-4 shrink-0 justify-center">
                {selected ? <Check className="h-4 w-4 text-primary" aria-hidden /> : null}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span lang={l.locale} dir={l.dir} className="font-medium">
                  {l.nativeName}
                </span>
                {l.code !== "en" ? (
                  <span lang="en" className="text-xs text-muted-foreground">
                    {l.englishName}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
