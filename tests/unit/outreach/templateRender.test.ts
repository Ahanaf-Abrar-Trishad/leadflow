import { renderTemplate } from "@/lib/outreach/templates/render";

describe("renderTemplate", () => {
  it("replaces every known field", () => {
    expect(renderTemplate("Hi {{first_name}} from {{company}}", { first_name: "Jane", company: "Acme" })).toBe(
      "Hi Jane from Acme",
    );
  });

  it("leaves an unresolved placeholder untouched rather than throwing", () => {
    expect(renderTemplate("Hi {{first_name}}", {})).toBe("Hi {{first_name}}");
  });

  it("tolerates extra whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ first_name }}", { first_name: "Jane" })).toBe("Hi Jane");
  });
});
