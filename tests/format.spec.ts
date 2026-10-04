import { test, expect } from "@playwright/test";
import { mailtoHref, pluralize, telHref } from "../src/lib/format";

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

test("pluralize", () => {
  expect(pluralize(1, "year")).toBe("1 year");
  expect(pluralize(0, "doctor")).toBe("0 doctors");
  expect(pluralize(2, "child", "children")).toBe("2 children");
});
