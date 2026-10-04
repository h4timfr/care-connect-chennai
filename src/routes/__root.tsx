import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

import appCss from "../styles.css?url";
import { AppProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/supabase/auth";
import { isSupabaseConfigured, supabaseConfigMessage } from "@/lib/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, languageInfo, loadMessages, useI18n } from "@/lib/i18n";
import { resolveInitialLanguage } from "@/lib/i18n/initial";

const SITE_TITLE = "CareConnect — Find doctors and book clinic appointments in Chennai";
const SITE_DESCRIPTION =
  "Find doctors and clinics across Chennai, book appointments online and message your clinic — all in one place.";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("notFound.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFound.body")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("notFound.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("routeError.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("routeError.body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("notFound.home")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The UI language is decided once per page load (cookie, else Accept-Language) and its
  // dictionary is sent with the server-rendered page, so hydration renders the same text.
  // Later changes happen in the browser through I18nProvider, without re-running this loader.
  loader: async () => {
    const lang = resolveInitialLanguage();
    return { lang, messages: await loadMessages(lang) };
  },
  staleTime: Infinity,
  shouldReload: false,
  head: ({ match }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // No child route matched: the root renders the 404 page, so give it its own title.
      { title: match.globalNotFound ? "Page not found — CareConnect" : SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "application-name", content: "CareConnect" },
      { name: "theme-color", content: "#047879" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "CareConnect" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { lang } = Route.useLoaderData();
  const info = languageInfo(lang);
  return (
    <html lang={info.locale} dir={info.dir} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Shown when the app has no usable backend configuration (details only in development). */
function ConfigErrorBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div
      role="alert"
      className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive"
    >
      {import.meta.env.DEV ? (
        <strong className="font-semibold">Configuration error: </strong>
      ) : null}
      {supabaseConfigMessage}
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { lang, messages } = Route.useLoaderData();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <I18nProvider initialLanguage={lang} initialMessages={messages}>
          <AuthProvider>
            <AppProvider>
              <ConfigErrorBanner />
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
              <Toaster position="top-center" richColors />
            </AppProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
