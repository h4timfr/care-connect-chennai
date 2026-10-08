import { test, expect } from "@playwright/test";
import { inr, longDate, mailtoHref, telHref, to12h } from "../src/lib/format";

test.describe("contact links", () => {
  test("tel: keeps only digits and a leading +", () => {
    expect(telHref("+91 44 4000 1201")).toBe("tel:+914440001201");
    expect(telHref("(044) 4000-1201")).toBe("tel:04440001201");
    expect(telHref("044+1;javascript:alert(1)")).toBe("tel:04411");
    expect(telHref("call us")).toBeNull();
  });

  test("mailto: rejects addresses that could smuggle parameters", () => {
    expect(mailtoHref("hello@clinic.in")).toBe("mailto:hello@clinic.in");
    expect(mailtoHref(" front.desk+in@clinic.co.in ")).toBe("mailto:front.desk%2Bin@clinic.co.in");
    expect(mailtoHref("a@b.com?bcc=x@evil.com")).toBeNull();
    expect(mailtoHref("a@b.com&body=hi")).toBeNull();
    expect(mailtoHref("javascript:alert(1)//@x.com")).toBeNull();
    expect(mailtoHref("not an email")).toBeNull();
  });
});

test.describe("locale-aware formatting", () => {
  test("English keeps the 12-hour clock patients know", () => {
    expect(to12h("19:30")).toBe("7:30 PM");
    expect(to12h("00:05:00")).toBe("12:05 AM");
    expect(to12h("12:00")).toBe("12:00 PM");
  });

  test("other languages use their own clock format with Latin digits", () => {
    expect(to12h("19:30", "ta-IN")).toMatch(/7:30/);
    expect(to12h("19:30", "ur")).toMatch(/7:30/);
  });

  test("fees use Indian digit grouping", () => {
    expect(inr(150000)).toBe("₹1,50,000");
    expect(inr(500, "hi-IN")).toBe("₹500");
  });

  test("dates are localized and invalid dates are empty, not 'Invalid Date'", () => {
    expect(longDate("2030-10-07")).toContain("October");
    expect(longDate("2030-10-07", "hi-IN")).toContain("अक्तूबर");
    expect(longDate("2030-13-45")).toBe("");
    expect(longDate("")).toBe("");
  });
});
