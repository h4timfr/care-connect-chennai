import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "@/components/AuthCard";
import { PasswordInput } from "@/components/PasswordInput";
import { PatientLink, PortalAuthCard, type Portal } from "@/components/ProviderAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { useAuth } from "@/lib/supabase/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  codeOf,
  describeAuthError,
  describeDataError,
  isNotDeployed,
  messageOf,
} from "@/lib/supabase/errors";

/** Marks a required label. Inputs also carry `required`, which screen readers announce. */
export function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  );
}

/**
 * Keeps an in-progress application on this device (business details only, never the password),
 * so it survives the email-confirmation round trip. Storage failures just mean no draft.
 */
function useDraft<T extends object>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue({ ...initial, ...(JSON.parse(raw) as Partial<T>) });
    } catch {
      // No draft available.
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per key
  }, [key]);
  const save = (next: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable: the draft just isn't kept.
    }
  };
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clear.
    }
  };
  return { value, setValue, save, clear };
}

export interface ProviderSignupProps<T extends object> {
  portal: Portal;
  title: string;
  subtitle: string;
  draftKey: string;
  initial: T;
  /** Fields of the application itself. */
  renderFields: (form: T, set: <K extends keyof T>(key: K, value: T[K]) => void) => ReactNode;
  /** Mirrors the database CHECK constraints; returns a message key for the first problem. */
  validate: (form: T) => MessageKey | null;
  /** Inserts the application as the signed-in account (RLS: applicant = auth.uid()). */
  submit: (form: T) => Promise<void>;
  /** Fills fields from the new account's details (name, email) before submitting. */
  withAccount?: (form: T, account: { name: string; email: string }) => T;
  /** Shown above the form for a signed-in account (its applications, existing access). */
  signedInExtras?: ReactNode;
  /** When set, the form is replaced by this message (e.g. the account is already a doctor). */
  blocked?: ReactNode;
}

type Stage = { kind: "form" } | { kind: "confirmEmail"; email: string } | { kind: "submitted" };

/**
 * Provider sign-up: creates (or uses) an ordinary CareConnect account and submits an application.
 * It never grants clinic or doctor access; a platform admin decides that after verification.
 */
export function ProviderSignup<T extends object>(props: ProviderSignupProps<T>) {
  const { portal, draftKey, initial, renderFields, validate, submit, withAccount } = props;
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const draft = useDraft(draftKey, initial);
  const form = draft.value;
  const set = <K extends keyof T>(key: K, value: T[K]) =>
    draft.setValue((f) => ({ ...f, [key]: value }));
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const describeSubmitError = (err: unknown) => {
    if (isNotDeployed(err)) return t("signup.notOpen");
    if (codeOf(err) === "P0001" && /Rate Limit/i.test(messageOf(err))) return t("signup.limit");
    if (codeOf(err) === "P0001" && /already linked/i.test(messageOf(err)))
      return t("signup.alreadyDoctor");
    if (codeOf(err) === "23514") return t("error.checkDetails");
    return t(describeDataError(err));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !isSupabaseConfigured) return;
    if (!user) {
      if (account.name.trim().length < 2) return setError(t("signup.error.name"));
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account.email.trim()))
        return setError(t("apply.error.email"));
      if (account.password.length < MIN_PASSWORD_LENGTH) {
        return setError(t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH }));
      }
    }
    // Empty contact fields default to the account's own name and email.
    const accountDetails = user
      ? { name: String(user.user_metadata?.["full_name"] ?? "").trim(), email: user.email ?? "" }
      : { name: account.name.trim(), email: account.email.trim() };
    const filled = withAccount ? withAccount(form, accountDetails) : form;
    const problem = validate(filled);
    if (problem) return setError(t(problem));
    setError(null);
    setSubmitting(true);
    try {
      if (!user) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: account.email.trim(),
          password: account.password,
          options: {
            data: { full_name: account.name.trim() },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (signUpError) {
          const described = describeAuthError(signUpError);
          setError(t(described.key, described.vars));
          return;
        }
        if (data.user && data.user.identities?.length === 0) {
          setError(t("authError.emailExists"));
          return;
        }
        if (!data.session) {
          // Email confirmation required: keep the details on this device for after sign-in.
          draft.save(filled);
          setStage({ kind: "confirmEmail", email: account.email.trim() });
          return;
        }
      }
      await submit(filled);
      draft.clear();
      setStage({ kind: "submitted" });
    } catch (err) {
      draft.save(filled);
      setError(describeSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  };

  let body: ReactNode;
  if (loading) {
    body = (
      <div role="status" className="flex justify-center py-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    );
  } else if (stage.kind === "confirmEmail") {
    body = (
      <div role="status" className="space-y-4 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
          <MailCheck className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="font-semibold">{t("auth.checkEmail")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`signup.${portal}.confirm` as MessageKey, { email: stage.email })}
        </p>
      </div>
    );
  } else if (stage.kind === "submitted") {
    body = (
      <div role="status" className="space-y-4 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="font-semibold">{t("apply.submittedTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`signup.${portal}.submitted` as MessageKey)}
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/">{t("portal.toPatientApp")}</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <div className="flex gap-3 rounded-xl border border-highlight/30 bg-highlight-soft p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-highlight" aria-hidden />
          <p className="text-foreground">{t(`signup.${portal}.verification` as MessageKey)}</p>
        </div>
        {user ? props.signedInExtras : null}
        {props.blocked && user ? (
          props.blocked
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <p className="text-xs text-muted-foreground">{t("apply.requiredNote")}</p>
            {!user ? (
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold text-primary">
                  {t("signup.section.account")}
                </legend>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="account-name">
                    {t("auth.fullName")}
                    <Required />
                  </Label>
                  <Input
                    id="account-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={account.name}
                    onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-email">
                    {t("auth.email")}
                    <Required />
                  </Label>
                  <Input
                    id="account-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    dir="ltr"
                    required
                    value={account.email}
                    onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-password">
                    {t("auth.password")}
                    <Required />
                  </Label>
                  <PasswordInput
                    id="account-password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    aria-describedby="account-password-hint"
                    value={account.password}
                    onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                  />
                  <p id="account-password-hint" className="text-xs text-muted-foreground">
                    {t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {t("signup.haveAccount")}{" "}
                  <Link
                    to={portal === "clinic" ? "/clinic/login" : "/doctor/login"}
                    search={{ redirect: portal === "clinic" ? "/clinic/signup" : "/doctor/signup" }}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {t("signup.signInFirst")}
                  </Link>
                </p>
              </fieldset>
            ) : null}
            {renderFields(form, set)}
            <p className="text-xs text-muted-foreground">{t("apply.privacy")}</p>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Button
              type="submit"
              variant="highlight"
              size="lg"
              className="w-full"
              disabled={submitting || !isSupabaseConfigured}
            >
              {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {submitting
                ? t("apply.submitting")
                : user
                  ? t("apply.submit")
                  : t("signup.createAndSubmit")}
            </Button>
          </form>
        )}
        <PatientLink signup />
      </div>
    );
  }

  return (
    <PortalAuthCard portal={portal} title={props.title} subtitle={props.subtitle} wide>
      {body}
    </PortalAuthCard>
  );
}
