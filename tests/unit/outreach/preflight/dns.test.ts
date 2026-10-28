import { checkSpf, checkDmarc, checkDkim, checkDkimAny } from "@/lib/outreach/preflight/dns";
import { dkimSelectors } from "@/lib/outreach/preflight";

describe("DNS preflight checks", () => {
  it("passes SPF when a v=spf1 TXT record is present", async () => {
    const resolver = jest.fn().mockResolvedValue([["v=spf1 include:_spf.google.com ~all"]]);
    expect(await checkSpf("example.com", resolver)).toMatchObject({ id: "spf", pass: true });
  });

  it("fails SPF when no matching TXT record is present", async () => {
    const resolver = jest.fn().mockResolvedValue([["some-other-record"]]);
    expect(await checkSpf("example.com", resolver)).toMatchObject({ id: "spf", pass: false });
  });

  it("fails SPF when the lookup throws", async () => {
    const resolver = jest.fn().mockRejectedValue(new Error("ENOTFOUND"));
    expect(await checkSpf("example.com", resolver)).toMatchObject({ id: "spf", pass: false });
  });

  it("checks DMARC at the _dmarc subdomain", async () => {
    const resolver = jest.fn().mockResolvedValue([["v=DMARC1; p=quarantine"]]);
    const result = await checkDmarc("example.com", resolver);
    expect(resolver).toHaveBeenCalledWith("_dmarc.example.com");
    expect(result).toMatchObject({ id: "dmarc", pass: true });
  });

  it("checks DKIM at the selector's _domainkey subdomain", async () => {
    const resolver = jest.fn().mockResolvedValue([["v=DKIM1; k=rsa; p=..."]]);
    const result = await checkDkim("example.com", "google", resolver);
    expect(resolver).toHaveBeenCalledWith("google._domainkey.example.com");
    expect(result).toMatchObject({ id: "dkim", pass: true });
  });

  it("passes DKIM on whichever provider selector has a record", async () => {
    const resolver = jest.fn(async (name: string) => {
      if (name === "selector1._domainkey.example.com") return [["v=DKIM1; k=rsa; p=abc"]];
      throw new Error("ENOTFOUND");
    });
    const result = await checkDkimAny("example.com", ["google", "selector1", "zoho"], resolver);
    expect(result).toMatchObject({ id: "dkim", pass: true });
    expect(resolver).not.toHaveBeenCalledWith("zoho._domainkey.example.com");
  });

  it("fails DKIM with a hint when no selector has a record", async () => {
    const resolver = jest.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const result = await checkDkimAny("example.com", ["google", "selector1"], resolver);
    expect(result).toMatchObject({ pass: false });
    expect(result.detail).toMatch(/DKIM_SELECTOR/);
  });

  it("tries configured selectors first, then the common ones, without duplicates", () => {
    const original = process.env.DKIM_SELECTOR;
    process.env.DKIM_SELECTOR = "mxvault, google";
    try {
      const selectors = dkimSelectors();
      expect(selectors.slice(0, 2)).toEqual(["mxvault", "google"]);
      expect(selectors.filter((s) => s === "google")).toHaveLength(1);
      expect(selectors).toContain("hostingermail1");
    } finally {
      process.env.DKIM_SELECTOR = original;
    }
  });
});
