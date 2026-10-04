import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { describeDataError } from "@/lib/supabase/errors";

/** Opens (or starts) the patient's conversation with a clinic. */
export function MessageClinicButton({
  clinicId,
  doctorId,
  appointmentId,
  variant = "outline",
  size = "sm",
  className,
}: {
  clinicId: string;
  doctorId?: string;
  appointmentId?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { user } = useAuth();
  const { patient, isLoadingPatient, ensureConversation } = useApp();
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  const [opening, setOpening] = useState(false);

  const open = async () => {
    if (!user) {
      navigate({ to: "/login", search: { redirect: href } });
      return;
    }
    if (!patient) {
      toast.error("Your account has no patient profile, so it can't message clinics.");
      return;
    }
    setOpening(true);
    try {
      const conversationId = await ensureConversation({
        clinicId,
        ...(doctorId ? { doctorId } : {}),
        ...(appointmentId ? { appointmentId } : {}),
      });
      navigate({ to: "/messages", search: { c: conversationId } });
    } catch (err) {
      toast.error(describeDataError(err));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={open}
      disabled={opening || (!!user && isLoadingPatient)}
    >
      {opening ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <MessageCircle className="h-4 w-4" aria-hidden />
      )}
      Message clinic
    </Button>
  );
}
