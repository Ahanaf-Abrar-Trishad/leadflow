import { runPreflight } from "@/lib/outreach/preflight";

describe("runPreflight", () => {
  const passingResolver = jest.fn(async (hostname: string) => {
    if (hostname === "example.com") return [["v=spf1 ~all"]];
    if (hostname === "_dmarc.example.com") return [["v=DMARC1; p=none"]];
    if (hostname === "default._domainkey.example.com") return [["v=DKIM1; p=..."]];
    throw new Error("not found");
  });

  it("passes when DNS, postal address, and every merge field resolve", async () => {
    const result = await runPreflight(
      {
        senderDomain: "example.com",
        dkimSelector: "default",
        postalAddress: "123 Main St",
        templates: ["Hi {{first_name}}"],
        contacts: [{ id: "1", email: "a@x.com", fields: { first_name: "Jane" } }],
      },
      passingResolver,
    );
    expect(result.pass).toBe(true);
  });

  it("fails when the postal address is missing, even if DNS and templates pass", async () => {
    const result = await runPreflight(
      {
        senderDomain: "example.com",
        dkimSelector: "default",
        postalAddress: "",
        templates: ["Hi {{first_name}}"],
        contacts: [{ id: "1", email: "a@x.com", fields: { first_name: "Jane" } }],
      },
      passingResolver,
    );
    expect(result.pass).toBe(false);
    expect(result.hasPostalAddress).toBe(false);
  });

  it("fails when a contact is missing a merge field", async () => {
    const result = await runPreflight(
      {
        senderDomain: "example.com",
        dkimSelector: "default",
        postalAddress: "123 Main St",
        templates: ["Hi {{first_name}}"],
        contacts: [{ id: "1", email: "a@x.com", fields: {} }],
      },
      passingResolver,
    );
    expect(result.pass).toBe(false);
    expect(result.unresolvedContacts).toHaveLength(1);
  });

  it("skips SPF/DKIM/DMARC lookups when skipDnsChecks is set, e.g. for a Gmail-OAuth mailbox's domain", async () => {
    const noResolutionResolver = jest.fn(async () => {
      throw new Error("should never be called");
    });

    const result = await runPreflight(
      {
        senderDomain: "gmail.com",
        dkimSelector: "default",
        postalAddress: "123 Main St",
        templates: ["Hi {{first_name}}"],
        contacts: [{ id: "1", email: "a@x.com", fields: { first_name: "Jane" } }],
        skipDnsChecks: true,
      },
      noResolutionResolver,
    );

    expect(noResolutionResolver).not.toHaveBeenCalled();
    expect(result.checks).toEqual([]);
    expect(result.pass).toBe(true);
  });
});
