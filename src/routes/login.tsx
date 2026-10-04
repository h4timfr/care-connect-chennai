import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Loader2, MailCheck, Stethoscope } from "lucide-react";
import { isSupabaseConfigured, supabase, supabaseConfigMessage } from "@/lib/supabase/client";
import { describeAuthError } from "@/lib/supabase/errors";
import { useAuth } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirect } from "@/lib/redirect";

interface LoginSearch {
  redirect?: string;
  signup?: boolean;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const params: LoginSearch = {};
    const { redirect, signup } = search;
    if (typeof redirect === "string") params.redirect = redirect;
    if (signup === true || signup === "true") params.signup = true;
    return params;
  },
  head: () => ({
    meta: [{ title: "Sign in — CareConnect" }],
  }),
  component: LoginPage,
});

const MIN_PASSWORD_LENGTH = 8;

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const redirectTo = safeRedirect(search.redirect);

  const [isSignUp, setIsSignUp] = useState(search.signup ?? false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setIsSignUp(search.signup ?? false);
  }, [search.signup]);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: redirectTo, replace: true });
  }, [user, authLoading, navigate, redirectTo]);

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setError(null);
    setConfirmationSentTo(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !isSupabaseConfigured) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
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
          setConfirmationSentTo(email.trim());
        }
        // With a session, the auth listener signs the user in and the effect above redirects.
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="surface-card w-full max-w-sm rounded-2xl p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground"
            aria-label="CareConnect home"
          >
            <Stethoscope className="h-6 w-6" aria-hidden />
          </Link>
          <h1 className="font-display text-2xl font-bold">
            {isSignUp ? "Create your account" : "Sign in to CareConnect"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignUp
              ? "Book appointments and message clinics in one place."
              : "Welcome back. Sign in to manage your appointments."}
          </p>
        </div>

        {!isSupabaseConfigured ? (
          <div
            role="alert"
            className="mb-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{supabaseConfigMessage}</p>
          </div>
        ) : null}

        {confirmationSentTo ? (
          <div role="status" className="space-y-4 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
              <MailCheck className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Check your email</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a confirmation link to <strong>{confirmationSentTo}</strong>. Open it to
                activate your account, then sign in.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={switchMode}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp ? (
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
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                aria-describedby={isSignUp ? "password-hint" : undefined}
              />
              {isSignUp ? (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              ) : null}
            </div>

            {error ? (
              <div
                role="alert"
                className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 pt-1">
              <Button type="submit" disabled={submitting || !isSupabaseConfigured}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {submitting
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </Button>
              <Button type="button" variant="ghost" onClick={switchMode} disabled={submitting}>
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "New to CareConnect? Create an account"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
