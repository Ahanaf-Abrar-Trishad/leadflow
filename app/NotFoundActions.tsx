"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";

export function NotFoundActions() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link
        href="/outreach/dashboard"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white shadow-raised transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-signal-strong hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.96]"
      >
        Back to dashboard
      </Link>
      <Button variant="secondary" onClick={() => router.back()}>
        Go back
      </Button>
    </div>
  );
}
