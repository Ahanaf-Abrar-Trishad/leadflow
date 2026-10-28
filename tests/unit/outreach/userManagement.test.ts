import { isLastAdmin } from "@/lib/outreach/auth/userManagement";

describe("isLastAdmin", () => {
  const admin1 = { id: "1", role: "admin" };
  const admin2 = { id: "2", role: "admin" };
  const member = { id: "3", role: "member" };

  it("is true for the sole admin", () => {
    expect(isLastAdmin([admin1, member], "1")).toBe(true);
  });

  it("is false when another admin exists", () => {
    expect(isLastAdmin([admin1, admin2, member], "1")).toBe(false);
  });

  it("is false for a member, regardless of admin count", () => {
    expect(isLastAdmin([admin1, member], "3")).toBe(false);
  });

  it("is false for an id that isn't in the list", () => {
    expect(isLastAdmin([admin1, member], "does-not-exist")).toBe(false);
  });
});
