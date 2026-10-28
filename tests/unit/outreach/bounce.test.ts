import { isDsnMessage, extractStatusCode, classifyStatusCode } from "@/lib/outreach/poller/bounce";

describe("isDsnMessage", () => {
  it("recognizes a mailer-daemon sender", () => {
    expect(isDsnMessage("mailer-daemon@relay.example.com", "Subject: Undelivered")).toBe(true);
  });
  it("recognizes a postmaster sender", () => {
    expect(isDsnMessage("postmaster@example.com", "Subject: Undelivered")).toBe(true);
  });
  it("recognizes the RFC 3464 content-type even from an unusual sender", () => {
    expect(
      isDsnMessage("bounce@example.com", 'Content-Type: multipart/report; report-type=delivery-status'),
    ).toBe(true);
  });
  it("returns false for an ordinary reply", () => {
    expect(isDsnMessage("jane@acme.com", "Subject: Re: Quick question\n\nSure, let's talk.")).toBe(false);
  });
});

describe("extractStatusCode", () => {
  it("extracts a Status: field", () => {
    expect(extractStatusCode("Some headers\nStatus: 5.1.1\nMore text")).toBe("5.1.1");
  });
  it("returns null when there is no Status: field", () => {
    expect(extractStatusCode("No status field here")).toBeNull();
  });
});

describe("classifyStatusCode", () => {
  it("classifies 5.x.x as hard", () => {
    expect(classifyStatusCode("5.1.1")).toBe("hard");
  });
  it("classifies 4.x.x as soft", () => {
    expect(classifyStatusCode("4.2.2")).toBe("soft");
  });
  it("classifies anything else, or null, as unknown", () => {
    expect(classifyStatusCode("2.1.5")).toBe("unknown");
    expect(classifyStatusCode(null)).toBe("unknown");
  });
});
