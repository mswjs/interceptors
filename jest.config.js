module.exports = {
  preset: 'ts-jest',
  testMatch: ['**/*.test.ts'],
  testTimeout: 60000,
  setupFilesAfterEnv: ['./jest.setup.js'],
}
