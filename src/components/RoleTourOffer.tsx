import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { hasOnboardingDecision, rememberOnboardingDecision } from "@/lib/onboarding-preferences";

export function RoleTourOffer({
  role,
  onStart,
}: {
  role: "doctor" | "clinic" | "admin";
  onStart: () => void;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const key = `careconnect.tour.${role}.v1`;

  useEffect(() => {
    setVisible(!hasOnboardingDecision(key));
  }, [key]);

  if (!visible) return null;
  const dismiss = () => {
    rememberOnboardingDecision(key);
    setVisible(false);
  };
  return (
    <section aria-label={t("welcome.tourOffer")} className="surface-card mb-4 p-4">
      <p className="font-semibold">{t("welcome.tourOffer")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("welcome.tourHint")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-auto min-h-9 max-w-full whitespace-normal [overflow-wrap:anywhere]"
          onClick={() => {
            dismiss();
            onStart();
          }}
        >
          {t("welcome.startTour")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-9 max-w-full whitespace-normal [overflow-wrap:anywhere]"
          onClick={(event) => {
            const main = event.currentTarget.closest("main");
            dismiss();
            main?.focus({ preventScroll: true });
          }}
        >
          {t("welcome.skipTour")}
        </Button>
      </div>
    </section>
  );
}
