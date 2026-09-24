import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd());
const supabaseUrl = env.VITE_SUPABASE_URL || "https://bqijgbmhlwtslhrtszsj.supabase.co";

export default {
  routeRules: {
    "/**": {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace("https://", "wss://")}; frame-ancestors 'none';`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      },
    },
  },
};
