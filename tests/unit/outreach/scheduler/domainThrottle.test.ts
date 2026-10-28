import { isDomainThrottled, extractDomain } from "@/lib/outreach/scheduler/domainThrottle";

describe("domainThrottle", () => {
  it("throttles once the count reaches the limit", () => {
    expect(isDomainThrottled(3, 3)).toBe(true);
    expect(isDomainThrottled(2, 3)).toBe(false);
  });
  it("extracts the domain from an email address, lowercased", () => {
    expect(extractDomain("Jane@Acme.COM")).toBe("acme.com");
  });
  it("returns an empty string for a malformed address", () => {
    expect(extractDomain("not-an-email")).toBe("");
  });
});
