export const PAGE_SIZE = 50;

export function parsePageParam(page: string | undefined): number {
  const parsed = Number(page);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function pageOffset(page: number): number {
  return (page - 1) * PAGE_SIZE;
}
