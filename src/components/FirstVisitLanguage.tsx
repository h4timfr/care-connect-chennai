import { Globe } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  hasLanguageCookie,
  LANGUAGES,
  normalizeLanguage,
  readStoredLanguage,
  useI18n,
  type Language,
} from "@/lib/i18n";
import {
  hasOnboardingDecision,
  LANGUAGE_WELCOME_KEY,
  rememberOnboardingDecision,
} from "@/lib/onboarding-preferences";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";

export function FirstVisitLanguage({
  onDismiss,
  onStartTour,
}: {
  onDismiss: () => void;
  onStartTour: () => void;
}) {
  const { loading } = useAuth();
  const { patient, isLoadingPatient, patientError } = useApp();
  const { lang, t, setLanguage } = useI18n();
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  const [firstVisit, setFirstVisit] = useState(false);
  const [pending, setPending] = useState<Language | null>(null);
  const [failed, setFailed] = useState(false);
  const [offerTour, setOfferTour] = useState(false);
  const offerHeading = useRef<HTMLHeadingElement>(null);
  const pendingChoice = useRef(false);

  useEffect(() => {
    setFirstVisit(
      !hasOnboardingDecision(LANGUAGE_WELCOME_KEY) && !hasLanguageCookie() && !readStoredLanguage(),
    );
  }, []);

  useEffect(() => {
    if (offerTour) offerHeading.current?.focus();
  }, [offerTour]);

  if (
    !firstVisit ||
    loading ||
    isLoadingPatient ||
    patientError ||
    normalizeLanguage(patient?.preferredLanguage)
  )
    return null;

  const dismiss = () => {
    rememberOnboardingDecision(LANGUAGE_WELCOME_KEY);
    setFirstVisit(false);
    if (panel.current?.contains(document.activeElement)) onDismiss();
  };

  const choose = async (choice: Language) => {
    if (pendingChoice.current) return;
    pendingChoice.current = true;
    setPending(choice);
    setFailed(false);
    try {
      await setLanguage(choice);
    } catch {
      setFailed(true);
    } finally {
      pendingChoice.current = false;
      setPending(null);
    }
  };

  return (
    <section ref={panel} aria-labelledby={heading} className="surface-card mb-4 min-w-0 p-4 sm:p-5">
      {offerTour ? (
        <div className="space-y-3">
          <h2
            id={heading}
            ref={offerHeading}
            tabIndex={-1}
            className="font-display text-lg font-semibold"
          >
            {t("welcome.tourOffer")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("welcome.tourHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                dismiss();
                onStartTour();
              }}
            >
              {t("welcome.startTour")}
            </Button>
            <Button type="button" variant="outline" onClick={dismiss}>
              {t("welcome.skipTour")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2
                id={heading}
                className="flex items-center gap-2 font-display text-lg font-semibold"
              >
                <Globe className="size-5 shrink-0 text-primary" aria-hidden />
                <span>{t("welcome.title")}</span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("welcome.language")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={!!pending}
              onClick={() => {
                if (!pendingChoice.current) dismiss();
              }}
            >
              {t("tour.skip")}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 md:grid-cols-6">
            {LANGUAGES.map((language) => (
              <Button
                key={language.code}
                type="button"
                variant={language.code === lang ? "default" : "outline"}
                aria-pressed={language.code === lang}
                lang={language.locale}
                dir={language.dir}
                aria-disabled={!!pending}
                className="h-auto min-h-10 min-w-0 whitespace-normal"
                onClick={() => void choose(language.code)}
              >
                {language.nativeName}
              </Button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("welcome.tourHint")}</p>
            <Button type="button" disabled={!!pending} onClick={() => setOfferTour(true)}>
              {t("welcome.getStarted")}
            </Button>
          </div>
          {pending ? (
            <p role="status" className="mt-2 text-sm">
              {t("common.loading")}
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t("welcome.languageError")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
