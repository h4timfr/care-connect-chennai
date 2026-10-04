import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthCard, FormAlert } from "@/components/AuthCard";
import { PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { useAuth } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { describeAuthError } from "@/lib/supabase/errors";
import { endPasswordRecovery, useIsPasswordRecovery } from "@/lib/supabase/recovery";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Choose a new password — CareConnect" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const recovering = useIsPasswordRecovery();
  const [linkError, setLinkError] = useState(false);

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
        title={linkError ? "This link has expired" : "Reset link needed"}
        subtitle={
          linkError
            ? "Password reset links can be used once and expire after a while."
            : "Open the password reset link from your email to choose a new password."
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          To get a new link, go to sign in and choose “Forgot password?”.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to sign in</Link>
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(describeAuthError(updateError));
        return;
      }
      endPasswordRecovery();
      toast.success("Your password has been updated.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Choose a new password"
      subtitle={email ? `For ${email}` : "Enter a new password for your account."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-describedby="new-password-hint"
          />
          <p id="new-password-hint" className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
          />
        </div>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
