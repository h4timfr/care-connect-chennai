import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Loader2,
  LogOut,
  MailCheck,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "@/components/AuthCard";
import { ErrorState } from "@/components/common";
import { LanguageSelect } from "@/components/LanguageSelect";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { isSupabaseConfigured, supabase, supabaseConfigMessage } from "@/lib/supabase/client";
import { describeAuthError, describeDataError } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";

export type Portal = "clinic" | "doctor";

const PORTAL = {
  clinic: {
    icon: Building2,
    name: "portal.clinic.name",
    accent: "border-t-highlight",
    badge: "bg-highlight-soft text-highlight",
    backdrop: "from-highlight-soft via-background to-primary-soft",
    signup: "/clinic/signup",
    login: "/clinic/login",
  },
  doctor: {
    icon: Stethoscope,
    name: "portal.doctor.name",
    accent: "border-t-primary",
    badge: "bg-primary-soft text-primary",
    backdrop: "from-primary-soft via-background to-highlight-soft",
    signup: "/doctor/signup",
    login: "/doctor/login",
  },
} as const satisfies Record<Portal, Record<string, unknown>>;

/** The patient AuthCard with a portal mark: same brand, clearly a provider entrance. */
export function PortalAuthCard({
  portal,
  title,
  subtitle,
  wide,
  children,
}: {
  portal: Portal;
  title: string;
  subtitle: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const p = PORTAL[portal];
  return (
    <div
      className={cn(
        "relative flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-16",
        p.backdrop,
      )}
    >
      <div className="absolute end-4 top-4">
        <LanguageSelect />
      </div>
      <div
        className={cn(
          "surface-raised w-full rounded-2xl border-t-4 p-6 sm:p-8",
          p.accent,
          wide ? "max-w-2xl" : "max-w-sm",
        )}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-highlight text-primary-foreground shadow-sm"
            aria-label={t("nav.homeLink")}
          >
            <Stethoscope className="h-6 w-6" aria-hidden />
          </Link>
          <p className="font-display text-sm font-bold">CareConnect</p>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              p.badge,
            )}
          >
            <p.icon className="h-3.5 w-3.5" aria-hidden />
            {t(p.name)}
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold [overflow-wrap:anywhere]">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Result of the portal's authorization check, which the database decides. */
export type PortalAccess =
  | { status: "checking" }
  | { status: "granted" }
  | { status: "denied" }
  | { status: "error"; error: unknown; retry: () => void };

/**
 * Sign-in for a provider portal. Supabase Auth authenticates; `access` (resolved from the
 * account's clinic membership or doctor link) decides whether the portal opens. Until it says
 * "granted" no portal is shown, and "denied" never reveals any clinic or doctor data.
 */
export function ProviderSignIn({
  portal,
  access,
}: {
  portal: Portal;
  access: PortalAccess | null;
}) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { t } = useI18n();
  const p = PORTAL[portal];
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (
    authLoading ||
    (user && (!access || access.status === "checking" || access.status === "granted"))
  ) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {user ? t("portal.checkingAccess") : t("common.loading")}
      </div>
    );
  }

  if (user && access?.status === "error") {
    return (
      <ErrorState
        title={t("portal.accessError")}
        message={t(describeDataError(access.error))}
        onRetry={access.retry}
      />
    );
  }

  if (user && access?.status === "denied") {
    return (
      <div className="space-y-4 text-center" role="alert">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-warning/15 text-warning-foreground dark:text-warning">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">{t(`portal.${portal}.noAccessTitle` as MessageKey)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`portal.${portal}.noAccessBody` as MessageKey, { email: user.email ?? "" })}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild variant="highlight">
            <Link to={p.signup}>{t(`portal.${portal}.register` as MessageKey)}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">{t("portal.toPatientApp")}</Link>
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut aria-hidden />
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !isSupabaseConfigured) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError)
          setError(t(describeAuthError(resetError).key, describeAuthError(resetError).vars));
        else setResetSentTo(email.trim());
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          const described = describeAuthError(signInError);
          setError(t(described.key, described.vars));
        }
        // On success the auth listener updates the session; the page then resolves access.
      }
    } catch (err) {
      const described = describeAuthError(err);
      setError(t(described.key, described.vars));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (resetSentTo) {
    return (
      <div role="status" className="space-y-4 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
          <MailCheck className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">
          {t("auth.resetSent", { email: resetSentTo })}
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setResetSentTo(null);
            setMode("signin");
          }}
        >
          {t("auth.backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!isSupabaseConfigured ? <FormAlert>{supabaseConfigMessage}</FormAlert> : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${portal}-email`}>{t("auth.email")}</Label>
        <Input
          id={`${portal}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
        />
      </div>
      {mode === "signin" ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`${portal}-password`}>{t("auth.password")}</Label>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError(null);
              }}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {t("auth.forgotPassword")}
            </button>
          </div>
          <PasswordInput
            id={`${portal}-password`}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("auth.reset.subtitle")}</p>
      )}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting || !isSupabaseConfigured}
      >
        {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {mode === "reset" ? t("auth.reset.submit") : t(`portal.${portal}.submit` as MessageKey)}
      </Button>
      {mode === "reset" ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("signin")}>
          {t("auth.backToSignIn")}
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {t(`portal.${portal}.new` as MessageKey)}{" "}
          <Link
            to={p.signup}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t(`portal.${portal}.register` as MessageKey)}
          </Link>
        </p>
      )}
      <PatientLink />
    </form>
  );
}

/** "Are you a patient? Back to patient sign in" */
export function PatientLink({ signup }: { signup?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="border-t pt-4 text-center text-sm">
      <p className="text-muted-foreground">{t("portal.areYouPatient")}</p>
      <Link
        to="/login"
        search={signup ? { signup: true } : {}}
        className="font-semibold text-primary underline-offset-2 hover:underline"
      >
        {signup ? t("portal.backToPatientSignup") : t("portal.backToPatientSignin")}
      </Link>
    </div>
  );
}

/**
 * The provider entrances shown under the patient sign-in / sign-up forms. Deliberately secondary
 * to the patient form, but real destinations rather than stray links.
 */
export function ProviderEntrances({ mode }: { mode: "signin" | "signup" }) {
  const { t } = useI18n();
  const items = [
    {
      portal: "clinic" as const,
      to: mode === "signin" ? "/clinic/login" : "/clinic/signup",
      label: mode === "signin" ? "providerEntry.clinicSignIn" : "providerEntry.clinicRegister",
    },
    {
      portal: "doctor" as const,
      to: mode === "signin" ? "/doctor/login" : "/doctor/signup",
      label: mode === "signin" ? "providerEntry.doctorSignIn" : "providerEntry.doctorRegister",
    },
  ] as const;
  return (
    <section aria-labelledby="provider-entry-heading" className="mt-6 border-t pt-5">
      <h2 id="provider-entry-heading" className="text-center text-sm font-semibold">
        {mode === "signin" ? t("providerEntry.title") : t("providerEntry.signupTitle")}
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = PORTAL[item.portal].icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className="group flex h-full flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center text-xs font-semibold transition-[border-color,box-shadow] hover:border-highlight/40 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-lg",
                    PORTAL[item.portal].badge,
                  )}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="flex items-center gap-1 [overflow-wrap:anywhere]">
                  {t(item.label)}
                  <ArrowRight
                    className="hidden h-3.5 w-3.5 shrink-0 rtl:rotate-180 sm:inline"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
