// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { loadEnv, type ResolvedConfig } from "vite";
import {
  resolveBuildSupabaseConfig,
  usesBuildSystemEnvironment,
} from "./src/lib/supabase/build-config.ts";

const vercelEnv = process.env["VERCEL_ENV"];
// The repository build command keeps the guard active even if Vercel's system variables are hidden.
const vercelBuild =
  process.env["CARECONNECT_VERCEL_BUILD"] === "1" ||
  (process.env["VERCEL"] === "1" && vercelEnv !== "development");
const ignoreDotenv = usesBuildSystemEnvironment(process.env);
const bundleTestMode = process.env["CARECONNECT_BUNDLE_TEST"] === "1";
const bundleTestOutput = process.env["CARECONNECT_BUNDLE_TEST_OUTPUT"];

if (bundleTestMode) {
  const relativeOutput = bundleTestOutput ? relative(process.cwd(), resolve(bundleTestOutput)) : "";
  if (
    vercelBuild ||
    process.env["CI"] !== "true" ||
    process.env["CARECONNECT_ISOLATED_TEST"] !== "1" ||
    !bundleTestOutput ||
    !isAbsolute(bundleTestOutput) ||
    relativeOutput === "" ||
    (relativeOutput !== ".." &&
      !relativeOutput.startsWith(`..${sep}`) &&
      !isAbsolute(relativeOutput))
  ) {
    throw new Error("Synthetic bundle test configuration is not allowed for this build.");
  }
}

let selectedConfig: ReturnType<typeof resolveBuildSupabaseConfig> = {
  ok: false,
  error: "Supabase configuration is unavailable.",
};

export default defineConfig({
  envDefine: false,
  ...(bundleTestMode ? { nitro: { output: { dir: bundleTestOutput! } } } : {}),
  vite: {
    envPrefix: [],
    ...(bundleTestMode ? { build: { sourcemap: true } } : {}),
    plugins: [
      {
        name: "careconnect-public-config",
        configResolved(config: ResolvedConfig) {
          const source = ignoreDotenv ? process.env : loadEnv(config.mode, config.envDir, "VITE_");
          if (vercelBuild && vercelEnv !== "production" && vercelEnv !== "preview") {
            throw new Error("CareConnect Vercel builds require the VERCEL_ENV system variable.");
          }
          selectedConfig = resolveBuildSupabaseConfig(source, vercelEnv);
          if (vercelBuild && !selectedConfig.ok) throw new Error(selectedConfig.error);
        },
        resolveId(id) {
          if (id === "virtual:careconnect-public-config") return "\0" + id;
          return null;
        },
        load(id) {
          if (id === "\0virtual:careconnect-public-config") {
            return `export default ${JSON.stringify(selectedConfig)};`;
          }
          return null;
        },
      },
    ],
    // A hosted build must use its scoped environment. Synthetic tests must also ignore dotenv.
    ...(ignoreDotenv ? { envDir: false } : {}),
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
