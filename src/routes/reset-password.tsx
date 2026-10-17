import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthCard, FormAlert } from "@/components/AuthCard";
import { PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { useAuth } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { describeAuthError } from "@/lib/supabase/errors";
import { endPasswordRecovery, useIsPasswordRecovery } from "@/lib/supabase/recovery";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Choose a new password — CareConnect" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const recovering = useIsPasswordRecovery();
  const [linkError, setLinkError] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    // Expired or already-used links come back as #error=...&error_code=otp_expired.
    const params = new URLSearchParams(window.location.hash.slice(1));
    setLinkError(params.has("error") || params.has("error_code"));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <PageLoader />
      </div>
    );
  }

  // Only a session that came from a reset link may set a new password here; an ordinary
  // signed-in session must not be able to change the password without proving ownership.
  if (!user || !recovering) {
    return (
      <AuthCard
        title={linkError ? t("reset.expiredTitle") : t("reset.neededTitle")}
        subtitle={linkError ? t("reset.expiredSubtitle") : t("reset.neededSubtitle")}
      >
        <p className="mb-4 text-sm text-muted-foreground">{t("reset.getNewLink")}</p>
        <Button asChild className="w-full min-h-9 py-1.5 h-auto whitespace-normal text-center">
          <Link to="/login">{t("reset.goToSignIn")}</Link>
        </Button>
      </AuthCard>
    );
  }

  return <NewPasswordForm email={user.email ?? ""} />;
}

function NewPasswordForm({ email }: { email: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { t } = useI18n();
  const describeAuth = (err: unknown) => {
    const { key, vars } = describeAuthError(err);
    return t(key, vars);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(describeAuth(updateError));
        return;
      }
      endPasswordRecovery();
      toast.success(t("reset.updated"));
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(describeAuth(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title={t("reset.title")}
      subtitle={email ? t("reset.forEmail", { email }) : t("reset.forAccount")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lets password managers file the new password under the right account. */}
        {email ? (
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{t("reset.newPassword")}</Label>
          <PasswordInput
            id="new-password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-describedby="new-password-hint"
          />
          <p id="new-password-hint" className="text-xs text-muted-foreground">
            {t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">{t("reset.confirmPassword")}</Label>
          <PasswordInput
            id="confirm-password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
          />
        </div>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Button
          type="submit"
          className="w-full min-h-9 py-1.5 h-auto whitespace-normal text-center"
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("common.saving") : t("reset.save")}
        </Button>
      </form>
    </AuthCard>
  );
}
