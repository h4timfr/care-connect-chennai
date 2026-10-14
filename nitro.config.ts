import { loadEnv } from "vite";
import { resolveSupabaseConfig } from "./src/lib/supabase/config";

const env = loadEnv("production", process.cwd());
const supabaseConfig = resolveSupabaseConfig(env, process.env.VERCEL_ENV);
if (!supabaseConfig.ok) {
  throw new Error(supabaseConfig.error);
}
const supabaseUrl = new URL(supabaseConfig.url);
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
