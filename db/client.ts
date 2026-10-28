import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

config({ quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

/**
 * Jest sets NODE_ENV=test automatically for every test run. Integration
 * tests exercise real application code (runTick, runPoll, createSession,
 * dedupeContacts, ...) that imports `db` from this module directly, and
 * this project runs tests against the same database the deployed app
 * uses (one Supabase instance, by deliberate choice - not a separate test
 * database). That already caused a real incident once: a plain connection
 * let a test's TRUNCATE permanently wipe a real admin account and real
 * campaign/mailbox data.
 *
 * `max: 1` forces every query in a test run - the test file's own setup
 * queries AND every query the app code under test issues - onto the same
 * single physical connection, which `tests/integration/setup.ts` wraps in
 * BEGIN/ROLLBACK per test. Postgres's TRUNCATE is transactional, so the
 * existing TRUNCATE-based test cleanup works unchanged; nothing it does is
 * ever actually committed.
 */
const isTestRun = process.env.NODE_ENV === "test";

// `prepare: false` because DATABASE_URL may point at a PgBouncer transaction
// pooler (e.g. Supabase's transaction pooler on port 6543), which does not
// support prepared statements. Harmless against a direct connection too.
//
// `queryClient` is exported (not just `db`) so integration tests can close
// the connection pool in an `afterAll` - without that, Jest never sees the
// event loop go idle and hangs after every test has already passed.
export const queryClient = postgres(connectionString, { prepare: false, ...(isTestRun ? { max: 1 } : {}) });
export const db = drizzle(queryClient, { schema });

/**
 * Use instead of `db.transaction(callback)` everywhere in application
 * code. In production/dev this is a real transaction, unchanged. In test
 * mode, every test already runs inside its own outer transaction (opened
 * by tests/integration/setup.ts's beforeEach on this same max:1
 * connection) that is always rolled back. A real nested `BEGIN` on a
 * connection already inside a transaction does not create a true nested
 * transaction in Postgres (no SAVEPOINT) - it is a no-op warning, and the
 * matching `COMMIT` then commits the OUTER transaction too, which is
 * exactly what happened the first time this was tried: every test that
 * touched `db.transaction` (worker sends, campaign creation/start) leaked
 * real rows into the live database despite the rollback wrapper. In test
 * mode this runs the callback directly against the shared, already-
 * transactional `db` instead, so nothing ever issues that stray COMMIT.
 */
type Transaction = Parameters<typeof db.transaction>[0] extends (tx: infer TX) => unknown ? TX : never;

export async function runAtomic<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  // `db` has every query-builder method a real PgTransaction handle has
  // (insert/select/update/delete) - it only lacks transaction-specific
  // extras (rollback(), setTransaction(), ...) that none of this codebase's
  // db.transaction callbacks call. The cast bridges that real but harmless
  // structural gap; it only ever runs in test mode.
  if (isTestRun) return callback(db as unknown as Transaction);
  return db.transaction(callback);
}
