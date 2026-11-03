module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // End-to-end tests need a seeded database; run them with `npm run test:e2e`.
  // dist/ holds compiled copies (including the tests) from `npm run build`.
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/", "/dist/"],
};
