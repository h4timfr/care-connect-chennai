import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd());
const configuredUrl = env.VITE_SUPABASE_URL?.trim();
const configuredKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
if (process.env.VERCEL_ENV === "preview" && env.VITE_SUPABASE_TARGET !== "staging") {
  throw new Error(
    "Vercel preview requires VITE_SUPABASE_TARGET=staging and a staging Supabase URL.",
  );
}
if (process.env.VERCEL_ENV === "production" && env.VITE_SUPABASE_TARGET !== "production") {
  throw new Error("Vercel production requires VITE_SUPABASE_TARGET=production.");
}
if (!configuredUrl || !configuredKey) {
  throw new Error(
    "CareConnect build requires explicit VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY). Configure each Vercel environment separately.",
  );
}
let supabaseUrl: URL;
try {
  supabaseUrl = new URL(configuredUrl);
} catch {
  throw new Error("VITE_SUPABASE_URL must be a valid absolute URL.");
}
if (
  supabaseUrl.protocol !== "https:" &&
  !(supabaseUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(supabaseUrl.hostname))
) {
  throw new Error("VITE_SUPABASE_URL must use HTTPS outside local development.");
}
const supabaseOrigin = supabaseUrl.origin;
const realtimeOrigin = supabaseOrigin.replace(
  /^https?:/,
  supabaseUrl.protocol === "https:" ? "wss:" : "ws:",
);

export default {
  routeRules: {
    "/**": {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        // Google Fonts: stylesheet from fonts.googleapis.com, font files from fonts.gstatic.com.
        "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' ${supabaseOrigin} ${realtimeOrigin}; frame-ancestors 'none';`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      },
    },
  },
};
