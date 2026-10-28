import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testTimeout: 30000,
  // Every test runs inside a transaction that's always rolled back (see
  // tests/integration/setup.ts and db/client.ts) - required because these
  // tests run against the same live database the deployed app uses, not a
  // separate disposable one. Parallel Jest workers would each open their
  // own transaction and TRUNCATE the same tables concurrently: correct
  // (rollback keeps each worker's changes invisible to the others), but
  // the ACCESS EXCLUSIVE lock TRUNCATE takes would make them serialize on
  // lock waits anyway - serial execution up front is simpler and faster.
  maxWorkers: 1,
  setupFilesAfterEnv: ["<rootDir>/tests/integration/setup.ts"],
};

export default createJestConfig(config);
