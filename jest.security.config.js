module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/tests"],
  testMatch: ["**/investmentOpsSecurity.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        diagnostics: false,
        isolatedModules: true,
      },
    ],
  },
  testTimeout: 15000,
  verbose: true,
};
