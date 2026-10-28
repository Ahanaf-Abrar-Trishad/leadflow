import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in | LeadFlow" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/outreach") ? next : "/outreach";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="ambient-wash mx-auto w-full max-w-md px-4 py-20 outline-none sm:px-6"
    >
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-lifted sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink">Sign in</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          The outreach console sends real mail from your mailboxes, so it sits behind an account.
        </p>
        <div className="mt-6">
          <LoginForm next={safeNext} />
        </div>
      </div>
    </main>
  );
}
