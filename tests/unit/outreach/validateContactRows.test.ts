import { validateContactRows } from "@/lib/outreach/contacts/validateRows";

describe("validateContactRows", () => {
  it("splits valid rows from a mix, lowercasing email and moving other columns into fields", () => {
    const rows: Record<string, string>[] = [
      { Email: "Jane@Acme.com", first_name: "Jane", company: "Acme" },
      { Email: "", first_name: "Missing", company: "" },
      { Email: "not-an-email", first_name: "Bad", company: "" },
      { Email: "jane@acme.com", first_name: "Duplicate", company: "" },
    ];

    const result = validateContactRows(rows, "Email");

    expect(result.valid).toEqual([{ email: "jane@acme.com", fields: { first_name: "Jane", company: "Acme" } }]);
    expect(result.invalid).toEqual([
      { row: 1, email: "", reason: "Missing email address" },
      { row: 2, email: "not-an-email", reason: "Invalid email address" },
      { row: 3, email: "jane@acme.com", reason: "Duplicate within this file" },
    ]);
  });

  it("remaps a raw CSV header to the merge-field key templates reference", () => {
    const rows = [{ Email: "jane@acme.com", "Name ": "Jane" }];

    const result = validateContactRows(rows, "Email", { "Name ": "first_name" });

    expect(result.valid).toEqual([{ email: "jane@acme.com", fields: { first_name: "Jane" } }]);
  });

  it("drops a column mapped to an empty string", () => {
    const rows = [{ Email: "jane@acme.com", notes: "internal only" }];

    const result = validateContactRows(rows, "Email", { notes: "" });

    expect(result.valid).toEqual([{ email: "jane@acme.com", fields: {} }]);
  });
});
