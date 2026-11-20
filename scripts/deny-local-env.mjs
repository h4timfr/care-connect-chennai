// Test-only preload: fail before local dotenv or link-marker contents can be read.
import fs from "node:fs";
import promises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncBuiltinESMExports } from "node:module";

const root = path.resolve(process.env.CARECONNECT_ENV_GUARD_ROOT || process.cwd());
function protectedFile(value) {
  if (typeof value === "number") return false;
  const filename = value instanceof URL ? fileURLToPath(value) : String(value);
  const relative = path.relative(root, path.resolve(filename)).replaceAll("\\", "/").toLowerCase();
  if (relative.startsWith("../") || path.isAbsolute(relative)) return false;
  return (
    /(^|\/)\.env(?:\.|$)/.test(relative) ||
    ["supabase/.temp/project-ref", "supabase/.temp/linked-project.json"].includes(relative)
  );
}
function check(value) {
  if (protectedFile(value))
    throw new Error("Local environment/link-marker read blocked in synthetic tests.");
}
// Nitro's Vite adapter forces dotenv discovery without a disable option. In this test-only
// process namespace, private files are absent to discovery; attempted reads still fail closed.
const exists = fs.existsSync;
fs.existsSync = (filename) => (protectedFile(filename) ? false : exists(filename));
const stat = fs.statSync;
fs.statSync = function (filename, options) {
  if (!protectedFile(filename)) return stat.call(this, filename, options);
  if (options?.throwIfNoEntry === false) return undefined;
  throw Object.assign(new Error("Private test configuration is unavailable."), { code: "ENOENT" });
};
for (const [object, key] of [
  [fs, "readFileSync"],
  [fs, "readFile"],
  [fs, "openSync"],
  [fs, "open"],
  [fs, "createReadStream"],
  [promises, "readFile"],
  [promises, "open"],
]) {
  const original = object[key];
  object[key] = function (filename, ...args) {
    check(filename);
    return original.call(this, filename, ...args);
  };
}
syncBuiltinESMExports();
