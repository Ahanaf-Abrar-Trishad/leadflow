import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Set up outreach | LeadFlow" };

// Direct DB read, not cookies() - needs the explicit opt-out (see Phase 1's
// force-dynamic fix); this must never be statically prerendered as "no
// users yet".
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) notFound();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="ambient-wash mx-auto max-w-md px-4 py-20 outline-none sm:px-6"
    >
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-lifted sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink">Set up outreach</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Create the first account. It becomes an admin and can add others afterward.
        </p>
        <div className="mt-6">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
