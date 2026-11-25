import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { FormAlert } from "@/components/AuthCard";
import { ErrorState, InfoNotice } from "@/components/common";
import { PasswordInput } from "@/components/PasswordInput";
import { PatientLink, PortalAuthCard, type Portal } from "@/components/ProviderAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { toast } from "@/lib/toast";
import {
  clearProviderDraft,
  discardLegacyProviderDrafts,
  readProviderDraft,
  saveProviderDraft,
} from "@/lib/provider-application-draft";
import { useAuth } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { signUpProvider } from "@/lib/supabase/provider-signup-auth";
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

export interface ProviderSignupProps<T extends object> {
  portal: Portal;
  title: string;
  subtitle: string;
  initial: T;
  /** Fields of the application itself. */
  renderFields: (form: T, set: <K extends keyof T>(key: K, value: T[K]) => void) => ReactNode;
  /** Mirrors the database CHECK constraints; returns a message key for the first problem. */
  validate: (form: T) => MessageKey | null;
  /** Inserts using the session of the account that owns the form. */
  submit: (form: T, ownerId: string) => Promise<void>;
  /** Fills fields from the new account's details (name, email) before submitting. */
  withAccount?: (form: T, account: { name: string; email: string }) => T;
  /** Shown above the form for a signed-in account (its applications, existing access). */
  signedInExtras?: ReactNode;
  /** Account queries that must succeed before opening the application form. */
  eligibilityChecks: {
    isPending: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  }[];
  /** When set, the form is replaced by this message (e.g. the account is already a doctor). */
  blocked?: ReactNode;
}

type Stage =
  { kind: "form" | "signInToResume" | "submitted" } | { kind: "confirmEmail"; email: string };

type SignupSubmission<T> = { portal: Portal; ownerId: string } & (
  | { kind: "submitting" }
  | { kind: "submitted" }
  | { kind: "failed"; fallbackForm: T | undefined; error: MessageKey }
);

function describeSubmitError(error: unknown): MessageKey {
  if (isNotDeployed(error)) return "signup.notOpen";
  if (codeOf(error) === "P0001" && /Rate Limit/i.test(messageOf(error))) return "signup.limit";
  if (codeOf(error) === "P0001" && /already linked/i.test(messageOf(error)))
    return "signup.alreadyDoctor";
  if (codeOf(error) === "23514") return "error.checkDetails";
  return describeDataError(error);
}

/**
 * Provider sign-up: creates (or uses) an ordinary CareConnect account and submits an application.
 * It never grants clinic or doctor access; a platform admin decides that after verification.
 */
export function ProviderSignup<T extends object>(props: ProviderSignupProps<T>) {
  const { user, loading } = useAuth();
  const { portal, submit } = props;
  const ownerId = loading ? null : (user?.id ?? null);
  const [signupSubmission, setSignupSubmission] = useState<SignupSubmission<T> | null>(null);
  const [previousOwnerId, setPreviousOwnerId] = useState(ownerId);
  if (ownerId !== previousOwnerId) {
    setPreviousOwnerId(ownerId);
    if (signupSubmission?.ownerId === previousOwnerId) setSignupSubmission(null);
  }
  useEffect(discardLegacyProviderDrafts, []);

  // Auth can mount the signed-in form before signUp returns its immediate session. Carry that
  // submission across the remount only for the account and portal the signup actually created.
  const submitAfterSignup = async (
    form: T,
    signupOwnerId: string,
    revision: string | undefined,
  ) => {
    const attempt = { portal, ownerId: signupOwnerId, kind: "submitting" } as const;
    setSignupSubmission(attempt);
    let result: SignupSubmission<T>;
    try {
      await submit(form, signupOwnerId);
      if (revision) await clearProviderDraft(portal, signupOwnerId, revision);
      result = { ...attempt, kind: "submitted" };
    } catch (error) {
      result = {
        ...attempt,
        kind: "failed",
        fallbackForm: revision ? undefined : form,
        error: describeSubmitError(error),
      };
    }
    setSignupSubmission((current) => (current === attempt ? result : current));
  };

  const ownedSubmission =
    signupSubmission?.portal === portal && signupSubmission.ownerId === ownerId
      ? signupSubmission
      : null;

  return (
    <ProviderSignupForm
      key={JSON.stringify([portal, loading, ownerId, ownedSubmission?.kind])}
      {...props}
      user={loading ? null : user}
      loading={loading}
      signupSubmission={ownedSubmission}
      submitAfterSignup={submitAfterSignup}
    />
  );
}

function ProviderSignupForm<T extends object>(
  props: ProviderSignupProps<T> & {
    user: User | null;
    loading: boolean;
    signupSubmission: SignupSubmission<T> | null;
    submitAfterSignup: (form: T, ownerId: string, revision: string | undefined) => Promise<void>;
  },
) {
  const { portal, initial, renderFields, validate, submit, withAccount, user, loading } = props;
  const { t } = useI18n();
  const [loadedDraft] = useState(() => {
    const fallback =
      props.signupSubmission?.kind === "failed"
        ? (props.signupSubmission.fallbackForm ?? initial)
        : initial;
    return user
      ? readProviderDraft(portal, user.id, fallback)
      : {
          form: initial,
          revision: null,
          saved: false,
        };
  });
  const [form, setForm] = useState(loadedDraft.form);
  const latestForm = useRef(form);
  const draftRevision = useRef(Promise.resolve(loadedDraft.revision));
  const edits = useRef(0);
  const preserveEdits = useRef(loadedDraft.saved);
  const [draftConflict, setDraftConflict] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const saveOwnedDraft = (ownerId: string, next: T) => {
    const save = draftRevision.current.then(async (expected) => {
      const result = await saveProviderDraft(portal, ownerId, next, expected);
      if (result.kind === "conflict" && mounted.current) setDraftConflict(true);
      return { expected, result };
    });
    draftRevision.current = save.then(({ expected, result }) =>
      result.kind === "saved" ? result.revision : expected,
    );
    return save.then(({ result }) => result);
  };
  const reloadDraft = async () => {
    if (!user) return;
    await draftRevision.current;
    if (!mounted.current) return;
    const saved = readProviderDraft(portal, user.id, initial);
    draftRevision.current = Promise.resolve(saved.revision);
    latestForm.current = saved.form;
    preserveEdits.current = saved.saved;
    setForm(saved.form);
    setError(null);
    setDraftConflict(false);
  };
  const set = <K extends keyof T>(key: K, value: T[K]) => {
    const next = { ...latestForm.current, [key]: value };
    latestForm.current = next;
    edits.current++;
    setForm(next);
    if (user && preserveEdits.current) void saveOwnedDraft(user.id, next);
  };
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [stage, setStage] = useState<Stage>(() =>
    props.signupSubmission?.kind === "submitted" ? { kind: "submitted" } : { kind: "form" },
  );
  const [error, setError] = useState<string | null>(() =>
    props.signupSubmission?.kind === "failed" ? t(props.signupSubmission.error) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const failedChecks = props.eligibilityChecks.filter((query) => query.error);
  const failedCheck = failedChecks[0];
  const eligibilityLoading =
    user &&
    props.eligibilityChecks.some((query) => query.isPending || (query.error && query.isFetching));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      loading ||
      draftConflict ||
      inFlight.current ||
      !isSupabaseConfigured ||
      (user && (eligibilityLoading || failedCheck || props.blocked))
    )
      return;
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
    const submittedEdit = edits.current;
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      if (!user) {
        const signupPath = window.location.pathname;
        const {
          data,
          error: signUpError,
          adopt,
        } = await signUpProvider(
          {
            email: account.email.trim(),
            password: account.password,
            options: {
              data: { full_name: account.name.trim() },
              emailRedirectTo: `${window.location.origin}/login`,
            },
          },
          () => mounted.current && window.location.pathname === signupPath,
        );
        if (signUpError) {
          const described = describeAuthError(signUpError);
          setError(t(described.key, described.vars));
          return;
        }
        if (data.user?.identities?.length === 0) {
          setError(t("authError.emailExists"));
          return;
        }
        const ownerId = data.user?.id;
        if (!ownerId || (data.session && data.session.user.id !== ownerId)) {
          setError(t("error.generic"));
          return;
        }
        const draft = await saveProviderDraft(portal, ownerId, filled, null);
        setAccount((current) => ({ ...current, password: "" }));
        if (!data.session) {
          setStage({ kind: "confirmEmail", email: account.email.trim() });
          return;
        }
        if (await adopt?.()) {
          if (draft.kind !== "conflict") {
            await props.submitAfterSignup(
              filled,
              ownerId,
              draft.kind === "saved" ? draft.revision : undefined,
            );
          }
        } else {
          setStage({ kind: "signInToResume" });
        }
        return;
      }
      preserveEdits.current = true;
      const draft = await saveOwnedDraft(user.id, filled);
      if (draft.kind === "conflict") return;
      await submit(filled, user.id);
      if (draft.kind === "saved") {
        const clear = draftRevision.current.then(async (current) => {
          const result = await clearProviderDraft(portal, user.id, draft.revision);
          return result.kind === "saved" ? result.revision : current;
        });
        draftRevision.current = clear;
        await clear;
      }
      if (edits.current === submittedEdit) setStage({ kind: "submitted" });
      else if (mounted.current) toast.success(t("apply.submittedTitle"));
    } catch (err) {
      setError(t(describeSubmitError(err)));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  let body: ReactNode;
  if (loading || eligibilityLoading || props.signupSubmission?.kind === "submitting") {
    body = (
      <div
        role="status"
        aria-label={t("common.loading")}
        className="flex justify-center py-6 text-muted-foreground"
      >
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
  } else if (stage.kind === "signInToResume") {
    body = (
      <Button asChild className="w-full">
        <Link
          to="/login"
          search={{ redirect: portal === "clinic" ? "/clinic/signup" : "/doctor/signup" }}
        >
          {t("signup.signInFirst")}
        </Link>
      </Button>
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
        <Button
          asChild
          variant="outline"
          className="w-full min-h-9 py-1.5 h-auto whitespace-normal text-center"
        >
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
        {user && failedCheck ? (
          failedChecks.some((query) => isNotDeployed(query.error)) ? (
            <InfoNotice>{t("signup.notOpen")}</InfoNotice>
          ) : (
            <ErrorState
              compact
              title={t("apply.yourApplications")}
              message={t(describeDataError(failedCheck.error))}
              onRetry={() => {
                for (const query of failedChecks) void query.refetch();
              }}
            />
          )
        ) : props.blocked && user ? (
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
            {draftConflict ? (
              <div className="space-y-2">
                <FormAlert>{t("signup.draftConflict")}</FormAlert>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void reloadDraft()}
                >
                  {t("signup.reloadDraft")}
                </Button>
              </div>
            ) : null}
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Button
              type="submit"
              variant="highlight"
              size="lg"
              className="w-full min-h-11 py-2 h-auto whitespace-normal text-center"
              disabled={submitting || draftConflict || !isSupabaseConfigured}
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
