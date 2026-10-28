/**
 * Starts the outreach worker and poller inside the same process as the web
 * server. Both were previously only ever started as separate OS processes
 * (`npm run worker` / `npm run poller`) - fine for a VPS you SSH into, but
 * most single-process hosts (Hostinger's Node.js app hosting included) only
 * run one long-lived command, so nothing ever claimed a due enrollment or
 * checked for replies in that kind of deployment. This makes sending work
 * out of the box wherever `next start` runs, with no extra process to
 * configure on the host.
 *
 * Concurrency note: worker/tick.ts's own doc comment already flags that its
 * claim query assumes exactly one worker ticking at a time. Running the
 * loop in-process inherits that same assumption - if this app is ever
 * scaled to more than one running instance (multiple dynos/containers
 * behind a load balancer), set OUTREACH_BACKGROUND_JOBS=false on every
 * instance but one, or the claim step will need the redesign that comment
 * describes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (!shouldRunBackgroundJobs()) return;

  // `register()` can run more than once per process under `next dev`'s
  // hot-reload - a global flag keeps a second call from doubling up the
  // tick/poll intervals.
  const globalStore = globalThis as typeof globalThis & {
    __outreachBackgroundJobsStarted?: boolean;
  };
  if (globalStore.__outreachBackgroundJobsStarted) return;
  globalStore.__outreachBackgroundJobsStarted = true;

  const { startTickLoop } = await import("@/worker/tick");
  const { startPollLoop } = await import("@/worker/poller");

  startTickLoop();
  startPollLoop();
}

/**
 * Runs automatically once the app is actually deployed (`next start`,
 * NODE_ENV=production). Off by default under `next dev` so a developer
 * testing UI changes doesn't also start silently sending real mail through
 * whatever mailbox is connected - opt in with OUTREACH_BACKGROUND_JOBS=true
 * if you want it locally too. OUTREACH_BACKGROUND_JOBS=false always wins,
 * for the multi-instance case described above.
 */
function shouldRunBackgroundJobs(): boolean {
  const override = process.env.OUTREACH_BACKGROUND_JOBS;
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}
