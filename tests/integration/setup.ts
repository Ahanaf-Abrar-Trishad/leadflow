import { queryClient } from "@/db/client";

/**
 * Wraps every integration test in a transaction that is always rolled
 * back, never committed - see db/client.ts for why this exists. Runs
 * before/after every test in this project (via jest.integration.config.ts's
 * setupFilesAfterEnv), so it wraps each test file's own beforeEach/afterEach
 * without those files needing any changes: this file's beforeEach registers
 * first and so runs first (opening the transaction before a test file's own
 * beforeEach, e.g. a TRUNCATE, executes inside it); this file's afterEach
 * is the only afterEach any of these test files define, so ordering there
 * is not a concern.
 */
beforeEach(async () => {
  await queryClient`BEGIN`;
});

afterEach(async () => {
  await queryClient`ROLLBACK`;
});
