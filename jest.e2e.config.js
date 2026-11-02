// End-to-end tests only (they need a seeded database). Run with `npm run test:e2e`.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/e2e/**/*.e2e.test.ts"],
  testTimeout: 60000,
};
