import { useNavigate } from "@tanstack/react-router";
import { Loader2, Stethoscope } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { describeDataError } from "@/lib/supabase/errors";
import {
  useDoctorMessageEligibility,
  useOpenDoctorMessageThread,
} from "@/lib/supabase/private-doctor-messaging";
import { toast } from "@/lib/toast";

export function MessageDoctorButton({ appointmentId }: { appointmentId: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const eligibility = useDoctorMessageEligibility(appointmentId);
  const open = useOpenDoctorMessageThread();
  const currentUserId = useRef(user?.id);
  useEffect(() => {
    currentUserId.current = user?.id;
    return () => {
      currentUserId.current = undefined;
    };
  }, [user?.id]);

  if (eligibility.isError) {
    return (
      <Button variant="ghost" size="sm" onClick={() => void eligibility.refetch()}>
        {t("messages.doctorLoadError")} {t("common.tryAgain")}
      </Button>
    );
  }
  if (!eligibility.data) return null;

  const openThread = async () => {
    if (!user || open.isPending) return;
    try {
      const id = await open.mutateAsync(appointmentId);
      if (currentUserId.current === user.id) await navigate({ to: "/messages", search: { c: id } });
    } catch (error) {
      if (currentUserId.current === user.id) toast.error(t(describeDataError(error)));
    }
  };
  return (
    <Button
      size="sm"
      className="h-auto min-h-10 max-w-full whitespace-normal py-1.5 text-start"
      onClick={openThread}
      disabled={open.isPending}
    >
      {open.isPending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Stethoscope aria-hidden />
      )}
      {t("messageDoctor.button")}
    </Button>
  );
}
