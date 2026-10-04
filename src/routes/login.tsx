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
import { Trans, useI18n, type MessageKey } from "@/lib/i18n";

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

const COPY_KEY = { signin: "signin", signup: "signup", reset: "reset" } as const;
const copyKey = (mode: Mode, part: "title" | "subtitle" | "submit" | "busy") =>
  `auth.${COPY_KEY[mode]}.${part}` as MessageKey;

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
  const { t } = useI18n();
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

  const describeAuth = (err: unknown) => {
    const { key, vars } = describeAuthError(err);
    return t(key, vars);
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
          setError(describeAuth(signUpError));
        } else if (data.user && data.user.identities?.length === 0) {
          // Supabase returns an empty identity list instead of an error for an existing address.
          setError(t("authError.emailExists"));
        } else if (!data.session) {
          setNotice({ kind: "confirm", email: address });
        }
        // With a session, the auth listener signs the user in and the effect above redirects.
      } else if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        // Supabase does not reveal whether the address has an account, and neither do we.
        if (resetError) setError(describeAuth(resetError));
        else setNotice({ kind: "reset", email: address });
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: address,
          password,
        });
        if (signInError) setError(describeAuth(signInError));
      }
    } catch (err) {
      setError(describeAuth(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (authLoading || user) {
    return <div className="min-h-screen bg-muted/30" aria-busy="true" />;
  }

  return (
    <AuthCard title={t(copyKey(mode, "title"))} subtitle={t(copyKey(mode, "subtitle"))}>
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
            <h2 className="font-semibold">{t("auth.checkEmail")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <Trans
                k={notice.kind === "confirm" ? "auth.confirmSent" : "auth.resetSent"}
                values={{ email: <strong dir="ltr">{notice.email}</strong> }}
              />
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => changeMode("signin")}>
            {t("auth.backToSignIn")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="full-name">{t("auth.fullName")}</Label>
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
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("auth.emailPlaceholder")}
              dir="ltr"
            />
          </div>
          {mode !== "reset" ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                {mode === "signin" ? (
                  <button
                    type="button"
                    onClick={() => changeMode("reset")}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {t("auth.forgotPassword")}
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
                  {t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <FormAlert>{error}</FormAlert> : null}

          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" disabled={submitting || !isSupabaseConfigured}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitting ? t(copyKey(mode, "busy")) : t(copyKey(mode, "submit"))}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
              disabled={submitting}
            >
              {mode === "signin"
                ? t("auth.toSignUp")
                : mode === "signup"
                  ? t("auth.toSignIn")
                  : t("auth.backToSignIn")}
            </Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
