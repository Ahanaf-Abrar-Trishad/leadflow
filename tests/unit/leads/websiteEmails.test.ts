/** @jest-environment node */
import { extractEmails, fetchPublicPage, findWebsiteEmail } from "@/lib/leads/websiteEmails";

const publicLookup = async () => [{ address: "203.0.113.10", family: 4 as const }];

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });
}

describe("extractEmails", () => {
  it("lists the site's own addresses before third-party ones", () => {
    const html = `<p>Site by webdev@agency.io</p><a href="mailto:Front@AcmeDental.com">Email us</a>`;
    expect(extractEmails(html, "acmedental.com")).toEqual(["front@acmedental.com", "webdev@agency.io"]);
  });

  it("ignores placeholder and asset matches", () => {
    expect(extractEmails(`you@example.com icon@2x.png`, "acme.com")).toEqual([]);
  });
});

describe("fetchPublicPage", () => {
  it("refuses a site that resolves to a private address", async () => {
    const fetchImpl = jest.fn();
    const lookup = async () => [{ address: "10.0.0.5", family: 4 as const }];
    expect(await fetchPublicPage("http://internal.example/", { fetchImpl, lookup })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop and stops at one pointing inside the network", async () => {
    const fetchImpl = jest.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    const result = await fetchPublicPage("https://acme.com/", { fetchImpl, lookup: publicLookup });
    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses non-web ports", async () => {
    const fetchImpl = jest.fn();
    expect(await fetchPublicPage("http://acme.com:6379/", { fetchImpl, lookup: publicLookup })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("findWebsiteEmail", () => {
  it("falls through to the contact page when the homepage has no address", async () => {
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith("/contact") ? htmlResponse("Write to hello@acme.com") : htmlResponse("<h1>Welcome</h1>"),
    );
    expect(await findWebsiteEmail("https://acme.com", { fetchImpl, lookup: publicLookup })).toBe("hello@acme.com");
  });
});
