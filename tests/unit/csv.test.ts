import { parseCsv } from "@/lib/file-parsing/csv";

describe("parseCsv", () => {
  it("parses headers and rows from a CSV file", async () => {
    const csvContent = "Search Term,Clicks\nrunning shoes,10\nhiking boots,5\n";
    const file = new File([csvContent], "report.csv", { type: "text/csv" });

    const result = await parseCsv(file);

    expect(result.headers).toEqual(["Search Term", "Clicks"]);
    expect(result.rows).toEqual([
      { "Search Term": "running shoes", Clicks: "10" },
      { "Search Term": "hiking boots", Clicks: "5" },
    ]);
  });

  it("skips empty lines", async () => {
    const csvContent = "Term\nrunning shoes\n\nhiking boots\n";
    const file = new File([csvContent], "report.csv", { type: "text/csv" });

    const result = await parseCsv(file);

    expect(result.rows).toHaveLength(2);
  });
});
