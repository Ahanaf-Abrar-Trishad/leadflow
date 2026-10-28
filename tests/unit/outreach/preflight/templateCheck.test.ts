import { extractMergeFields, findUnresolvedContacts } from "@/lib/outreach/preflight/templateCheck";

describe("extractMergeFields", () => {
  it("finds every placeholder, de-duplicated", () => {
    expect(extractMergeFields("Hi {{first_name}}, re: {{company}}. Thanks, {{first_name}}.")).toEqual([
      "first_name",
      "company",
    ]);
  });
  it("returns an empty array when there are no placeholders", () => {
    expect(extractMergeFields("Hi there.")).toEqual([]);
  });
});

describe("findUnresolvedContacts", () => {
  const templates = ["Hi {{first_name}}", "Following up re: {{company}}"];

  it("flags a contact missing a required field", () => {
    expect(
      findUnresolvedContacts(templates, [{ id: "1", email: "a@x.com", fields: { first_name: "Jane" } }]),
    ).toEqual([{ contactId: "1", email: "a@x.com", missing: ["company"] }]);
  });

  it("treats a blank field value as missing", () => {
    expect(
      findUnresolvedContacts(templates, [
        { id: "1", email: "a@x.com", fields: { first_name: "Jane", company: "   " } },
      ]),
    ).toEqual([{ contactId: "1", email: "a@x.com", missing: ["company"] }]);
  });

  it("passes a contact with every field present", () => {
    expect(
      findUnresolvedContacts(templates, [
        { id: "1", email: "a@x.com", fields: { first_name: "Jane", company: "Acme" } },
      ]),
    ).toEqual([]);
  });
});
