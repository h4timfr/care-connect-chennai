import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { isSupabaseConfigured, supabase, supabaseConfigMessage } from "@/lib/supabase/client";
import { describeAuthError } from "@/lib/supabase/errors";
import { useAuth } from "@/lib/supabase/auth";
import { AuthCard, FormAlert } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirect } from "@/lib/redirect";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

interface LoginSearch {
  redirect?: string | undefined;
  signup?: boolean | undefined;
}

export const Route = createFileRoute("/login")({
  // TanStack Router merges validated values over the raw URL search, so a key left out here would
  // keep its raw, unvalidated value. Every key is therefore returned, as undefined when invalid.
  validateSearch: ({ redirect, signup }: Record<string, unknown>): LoginSearch => ({
    // Still checked by safeRedirect() before use.
    redirect: typeof redirect === "string" ? redirect : undefined,
    signup: signup === true || signup === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [{ title: "Sign in — CareConnect" }],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup" | "reset";

const COPY: Record<Mode, { title: string; subtitle: string; submit: string; busy: string }> = {
  signin: {
    title: "Sign in to CareConnect",
    subtitle: "Welcome back. Sign in to manage your appointments.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  signup: {
    title: "Create your account",
    subtitle: "Book appointments and message clinics in one place.",
    submit: "Create account",
    busy: "Creating account…",
  },
  reset: {
    title: "Reset your password",
    subtitle: "Enter your account email and we'll send you a link to choose a new password.",
    submit: "Send reset link",
    busy: "Sending…",
  },
};

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const redirectTo = safeRedirect(search.redirect);

  const [mode, setMode] = useState<Mode>(search.signup ? "signup" : "signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "confirm" | "reset"; email: string } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setMode(search.signup ? "signup" : "signin");
  }, [search.signup]);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: redirectTo, replace: true });
  }, [user, authLoading, navigate, redirectTo]);

  const changeMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !isSupabaseConfigured) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const address = email.trim();

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: address,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (signUpError) {
          setError(describeAuthError(signUpError));
        } else if (data.user && data.user.identities?.length === 0) {
          // Supabase returns an empty identity list instead of an error for an existing address.
          setError("An account with this email already exists. Try signing in instead.");
        } else if (!data.session) {
          setNotice({ kind: "confirm", email: address });
        }
        // With a session, the auth listener signs the user in and the effect above redirects.
      } else if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        // Supabase does not reveal whether the address has an account, and neither do we.
        if (resetError) setError(describeAuthError(resetError));
        else setNotice({ kind: "reset", email: address });
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: address,
          password,
        });
        if (signInError) setError(describeAuthError(signInError));
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (authLoading || user) {
    return <div className="min-h-screen bg-muted/30" aria-busy="true" />;
  }

  const copy = COPY[mode];

  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle}>
      {!isSupabaseConfigured ? (
        <div className="mb-4">
          <FormAlert>{supabaseConfigMessage}</FormAlert>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="space-y-4 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
            <MailCheck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">Check your email</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {notice.kind === "confirm" ? (
                <>
                  We sent a confirmation link to <strong>{notice.email}</strong>. Open it to
                  activate your account, then sign in.
                </>
              ) : (
                <>
                  If an account exists for <strong>{notice.email}</strong>, we've sent a link to
                  reset its password. The link can be used once.
                </>
              )}
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => changeMode("signin")}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          {mode !== "reset" ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" ? (
                  <button
                    type="button"
                    onClick={() => changeMode("reset")}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                aria-describedby={mode === "signup" ? "password-hint" : undefined}
              />
              {mode === "signup" ? (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <FormAlert>{error}</FormAlert> : null}

          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" disabled={submitting || !isSupabaseConfigured}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitting ? copy.busy : copy.submit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
              disabled={submitting}
            >
              {mode === "signin"
                ? "New to CareConnect? Create an account"
                : mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Back to sign in"}
            </Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
