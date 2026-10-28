import Link from "next/link";
import { ArrowRightIcon } from "@/components/shared/icons";

export interface PaginationProps {
  page: number;
  hasNextPage: boolean;
  /** Builds the href for a page number, so each caller keeps its own filters. */
  hrefFor: (page: number) => string;
}

const LINK_CLASSES =
  "group inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink shadow-raised transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-paper hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]";

/*
 * Rendered as links rather than buttons so a page of results is addressable -
 * an operator looking at a stalled enrollment can send someone the URL.
 *
 * There's no total count and so no page numbers: every list here is paged by
 * fetching one row more than fits, which answers "is there a next page" without
 * the second COUNT(*) over a table that only grows.
 */
export function Pagination({ page, hasNextPage, hrefFor }: PaginationProps) {
  if (page === 1 && !hasNextPage) return null;

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={LINK_CLASSES}>
          <ArrowRightIcon className="h-3.5 w-3.5 rotate-180 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
          Previous
        </Link>
      ) : (
        <span />
      )}

      <span data-numeric className="font-mono text-xs text-ink-faint">
        Page {page}
      </span>

      {hasNextPage ? (
        <Link href={hrefFor(page + 1)} rel="next" className={LINK_CLASSES}>
          Next
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
