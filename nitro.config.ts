import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd());
const supabaseUrl = env.VITE_SUPABASE_URL || "https://bqijgbmhlwtslhrtszsj.supabase.co";

export default {
  routeRules: {
    "/**": {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        // Google Fonts: stylesheet from fonts.googleapis.com, font files from fonts.gstatic.com.
        "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace("https://", "wss://")}; frame-ancestors 'none';`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      },
    },
  },
};
