import { PAGE_SIZE, parsePageParam, pageOffset } from "@/lib/outreach/pagination";

describe("pagination", () => {
  it("defaults to page 1 for missing, non-numeric, zero, or negative input", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-3")).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parsePageParam("3")).toBe(3);
  });

  it("computes a zero-based offset from a one-based page number", () => {
    expect(pageOffset(1)).toBe(0);
    expect(pageOffset(2)).toBe(PAGE_SIZE);
    expect(pageOffset(3)).toBe(PAGE_SIZE * 2);
  });
});
