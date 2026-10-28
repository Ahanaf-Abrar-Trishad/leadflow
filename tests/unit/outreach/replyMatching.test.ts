import { matchReplies } from "@/lib/outreach/poller/replyMatching";

describe("matchReplies", () => {
  it("matches an enrollment whose contact sent a tracked address", () => {
    const enrollments = [
      { enrollmentId: "e1", contactEmail: "jane@acme.com" },
      { enrollmentId: "e2", contactEmail: "bob@beta.com" },
    ];
    const result = matchReplies(enrollments, new Set(["jane@acme.com"]));
    expect(result).toEqual(["e1"]);
  });

  it("is case-insensitive", () => {
    const enrollments = [{ enrollmentId: "e1", contactEmail: "Jane@Acme.com" }];
    const result = matchReplies(enrollments, new Set(["jane@acme.com"]));
    expect(result).toEqual(["e1"]);
  });

  it("returns an empty array when nothing matches", () => {
    const enrollments = [{ enrollmentId: "e1", contactEmail: "jane@acme.com" }];
    expect(matchReplies(enrollments, new Set(["someone-else@example.com"]))).toEqual([]);
  });
});
