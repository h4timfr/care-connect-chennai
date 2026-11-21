import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const browserCode = /\.(?:[cm]?js|html|css)$/i;
const textAsset = /\.(?:[cm]?js|html|css|json|svg|txt|xml|webmanifest)$/i;
const privateFile =
  /(?:^|\/)(?:\.env(?:\.[^/]+)?|\.pgpass|\.dev\.vars|\.npmrc|[^/]+\.(?:pgpass|pem|key|p12|pfx|dump|backup|bak|sqlitedb|sqlite3?|gpg|age|zip|tar|tgz|gz|xz|bz2|7z))$/i;

export function forbiddenPath(filename, { tracked = false } = {}) {
  const normalized = filename.replaceAll("\\", "/");
  if (tracked && normalized === ".env.example") return false;
  return privateFile.test(normalized) || (!tracked && /\.map$/i.test(normalized));
}

export function secretType(content) {
  if (/\bsb_secret_[A-Za-z0-9_-]{8,}/.test(content)) return "Supabase secret key";
  if (/postgres(?:ql)?:\/\/[^:\s/@'"]+:[^@\s'"]+@/i.test(content)) return "PostgreSQL credentials";
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) return "private key";
  if (
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/.test(
      content,
    )
  )
    return "provider credential";
  for (const token of content.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      const payload = JSON.parse(Buffer.from(token[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return "Supabase legacy service role key";
    } catch {
      // A token-shaped string is insufficient evidence.
    }
  }
  return null;
}

export function inspectPublicAssets(root) {
  if (!lstatSync(root).isDirectory()) throw new Error("Invalid public build directory.");
  const findings = [];
  let scripts = 0;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      const display = path.relative(root, filename);
      if (entry.isSymbolicLink() || forbiddenPath(display)) {
        findings.push([display, "unsafe public path"]);
      } else if (entry.isDirectory()) {
        visit(filename);
      } else if (entry.isFile() && textAsset.test(display)) {
        if (/\.[cm]?js$/i.test(display)) scripts++;
        const content = readFileSync(filename, "utf8");
        const type = secretType(content);
        if (type) findings.push([display, type]);
        if (
          browserCode.test(display) &&
          /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/.test(content)
        ) {
          findings.push([display, "source map reference"]);
        }
      }
    }
  }
  visit(root);
  if (!scripts) throw new Error("No JavaScript found in public build output.");
  return findings;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [target, ...rest] = process.argv.slice(2);
    if (!target || rest.length) throw new Error("Invalid artifact gate arguments.");
    const findings =
      target === "--tracked"
        ? execFileSync("git", ["ls-files", "--cached", "-z"], { encoding: "utf8", timeout: 15_000 })
            .split("\0")
            .filter((filename) => forbiddenPath(filename, { tracked: true }))
            .map((filename) => [filename, "private file in the Git index"])
        : inspectPublicAssets(target);
    for (const [filename, reason] of findings)
      console.error(`${reason}: ${JSON.stringify(filename)}`);
    process.exitCode = Number(findings.length > 0);
  } catch {
    console.error("Security artifact gate could not verify its input.");
    process.exitCode = 1;
  }
}
