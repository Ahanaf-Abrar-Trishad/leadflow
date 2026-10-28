import { checkSpf, checkDmarc, checkDkim } from "@/lib/outreach/preflight/dns";

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
});
