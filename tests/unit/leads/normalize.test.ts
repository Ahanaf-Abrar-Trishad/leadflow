import { cleanEmail, dedupeKeyFor, normalizeWebsite, parseCount, parseRating, safeHttpUrl, scoreLead, websiteDomain } from "@/lib/leads/normalize";

describe("cleanEmail", () => {
  it("takes the first usable address from a multi-address cell, lowercased", () => {
    expect(cleanEmail("Info@Acme.com, sales@acme.com")).toBe("info@acme.com");
  });

  it("skips placeholder domains and image filenames", () => {
    expect(cleanEmail("you@example.com; logo@2x.png; hi@realbiz.com")).toBe("hi@realbiz.com");
  });

  it("strips mailto: and returns undefined when nothing is usable", () => {
    expect(cleanEmail("mailto:owner@shop.io")).toBe("owner@shop.io");
    expect(cleanEmail("not an email")).toBeUndefined();
    expect(cleanEmail("")).toBeUndefined();
  });
});

describe("normalizeWebsite / websiteDomain", () => {
  it("adds a scheme and parses a bare domain", () => {
    expect(normalizeWebsite("acmedental.com/contact")).toBe("https://acmedental.com/contact");
  });

  it("rejects values without a real host", () => {
    expect(normalizeWebsite("javascript:alert(1)")).toBeUndefined();
    expect(normalizeWebsite("n/a")).toBeUndefined();
  });

  it("drops www. and ignores hosts many businesses share", () => {
    expect(websiteDomain("https://www.AcmeDental.com/")).toBe("acmedental.com");
    expect(websiteDomain("https://www.facebook.com/acmedental")).toBeUndefined();
    expect(websiteDomain("https://acme.business.site")).toBeUndefined();
  });
});

describe("safeHttpUrl", () => {
  it("allows only absolute http(s) URLs", () => {
    expect(safeHttpUrl("https://instagram.com/acme")).toBe("https://instagram.com/acme");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,hi")).toBeUndefined();
    expect(safeHttpUrl("instagram.com/acme")).toBeUndefined();
  });
});

describe("dedupeKeyFor", () => {
  it("prefers the website domain, then email, then the source id, then name+address", () => {
    expect(dedupeKeyFor({ name: "A", website: "https://www.acme.com", email: "x@y.com" }, "gmaps")).toBe("domain:acme.com");
    expect(dedupeKeyFor({ name: "A", email: "x@y.com", externalId: "p1" }, "gmaps")).toBe("email:x@y.com");
    expect(dedupeKeyFor({ name: "A", externalId: "p1" }, "gmaps")).toBe("gmaps:p1");
    expect(dedupeKeyFor({ name: "Joe's Pizza", address: "1 Main St" }, "csv")).toBe("name:joe-s-pizza|1-main-st");
  });

  it("does not merge two businesses that only share a Facebook page host", () => {
    const a = dedupeKeyFor({ name: "A", website: "https://facebook.com/a", externalId: "1" }, "gmaps");
    const b = dedupeKeyFor({ name: "B", website: "https://facebook.com/b", externalId: "2" }, "gmaps");
    expect(a).not.toBe(b);
  });
});

describe("scoreLead", () => {
  it("weights reachability and caps at 100", () => {
    expect(scoreLead({ name: "A" })).toBe(0);
    expect(scoreLead({ name: "A", email: "a@b.co" })).toBe(40);
    expect(
      scoreLead({ name: "A", email: "a@b.co", phone: "1", website: "https://b.co", reviewCount: 50, rating: 3.9, followers: 5000 }),
    ).toBe(100);
  });
});

describe("parseCount / parseRating", () => {
  it("parses separators and K/M suffixes", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("12.5K")).toBe(12500);
    expect(parseCount("2m")).toBe(2000000);
    expect(parseCount("lots")).toBeUndefined();
  });

  it("accepts ratings from 0 to 5 only", () => {
    expect(parseRating("4.6")).toBe(4.6);
    expect(parseRating("7")).toBeUndefined();
    expect(parseRating("")).toBeUndefined();
  });
});
