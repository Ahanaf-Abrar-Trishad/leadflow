import { buildThreadHeaders } from "@/lib/outreach/templates/threading";

describe("buildThreadHeaders", () => {
  it("returns no headers for the first message in a thread", () => {
    expect(buildThreadHeaders([])).toEqual({});
  });

  it("points In-Reply-To at the most recent prior message, References at all of them", () => {
    expect(buildThreadHeaders(["<msg-1@example.com>"])).toEqual({
      inReplyTo: "<msg-1@example.com>",
      references: ["<msg-1@example.com>"],
    });

    expect(buildThreadHeaders(["<msg-1@example.com>", "<msg-2@example.com>"])).toEqual({
      inReplyTo: "<msg-2@example.com>",
      references: ["<msg-1@example.com>", "<msg-2@example.com>"],
    });
  });
});
