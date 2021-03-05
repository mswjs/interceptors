module.exports = {
  testTimeout: 60000,
  testMatch: ['**/*.browser.test.ts'],
  setupFilesAfterEnv: ['./jest.browser.setup.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
}
