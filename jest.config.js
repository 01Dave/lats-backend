module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // End-to-end tests need a seeded database; run them with `npm run test:e2e`.
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
};
