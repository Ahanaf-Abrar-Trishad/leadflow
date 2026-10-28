import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  roots: ["<rootDir>/lib", "<rootDir>/tests"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    
    "<rootDir>/tests/integration/",
  ],
  // Default 5s is too tight under full-suite CPU contention (many parallel
  // jsdom environments); async tests otherwise pass instantly in isolation.
  testTimeout: 15000,
};

export default createJestConfig(config);
