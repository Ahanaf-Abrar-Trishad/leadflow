import { nextBusinessWindow } from "@/lib/outreach/scheduler/businessHours";

const CONFIG = { startHour: 9, endHour: 16, days: [2, 3, 4] }; // Tue-Thu

describe("nextBusinessWindow", () => {
  it("returns the same time when already inside the window", () => {
    const wed10am = new Date("2026-09-02T10:00:00Z"); // Wednesday
    expect(nextBusinessWindow(wed10am, "UTC", CONFIG)).toEqual(wed10am);
  });

  it("rolls forward from a non-business day to the next business day", () => {
    const mon8am = new Date("2026-08-31T08:00:00Z"); // Monday
    expect(nextBusinessWindow(mon8am, "UTC", CONFIG).toISOString()).toBe("2026-09-01T09:00:00.000Z"); // Tue 09:00
  });

  it("rolls forward from after-hours to the next open day", () => {
    const thu5pm = new Date("2026-09-03T17:00:00Z"); // Thursday, after 16:00
    expect(nextBusinessWindow(thu5pm, "UTC", CONFIG).toISOString()).toBe("2026-09-08T09:00:00.000Z"); // next Tue 09:00
  });
});
