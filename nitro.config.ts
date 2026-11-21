import { loadEnv } from "vite";
import {
  resolveBuildSupabaseConfig,
  usesBuildSystemEnvironment,
} from "./src/lib/supabase/build-config";

const env = usesBuildSystemEnvironment(process.env)
  ? process.env
  : loadEnv("production", process.cwd());
const supabaseConfig = resolveBuildSupabaseConfig(env, process.env.VERCEL_ENV);
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
        "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' ${supabaseOrigin} ${realtimeOrigin}; frame-ancestors 'none';`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      },
    },
  },
};
