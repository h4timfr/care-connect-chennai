import { test, expect } from "@playwright/test";
import { safeRedirect } from "../src/lib/redirect";

test.describe("safeRedirect", () => {
  const allowed: [string, string][] = [
    ["/", "/"],
    ["/discover", "/discover"],
    ["/discover?q=test", "/discover?q=test"],
    ["/discover?q=a%20b&specialty=ent", "/discover?q=a%20b&specialty=ent"],
    ["/appointments", "/appointments"],
    ["/book/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "/book/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"],
    ["/messages?c=123#latest", "/messages?c=123#latest"],
    ["/logins-are-not-login", "/logins-are-not-login"],
  ];
  for (const [input, expected] of allowed) {
    test(`allows ${input}`, () => expect(safeRedirect(input)).toBe(expected));
  }

  const rejected = [
    "https://evil.com",
    "http://evil.com/discover",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "/\\\\evil.com",
    "\\\\evil.com",
    "/%5Cevil.com",
    "/%2F%2Fevil.com",
    "/%2fevil.com",
    "/\t/evil.com",
    "/%09/evil.com",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.com",
    "discover",
    "/login",
    "/login?redirect=/profile",
    "/login?redirect=/login?redirect=/profile",
    "/login/",
    "/%E0%A4%A",
    "",
    "   ",
    "/" + "a".repeat(5000),
  ];
  for (const input of rejected) {
    test(`rejects ${JSON.stringify(input).slice(0, 60)}`, () =>
      expect(safeRedirect(input)).toBe("/"));
  }

  test("rejects non-strings", () => {
    for (const input of [undefined, null, 42, {}, ["/discover"]]) {
      expect(safeRedirect(input)).toBe("/");
    }
  });
});
