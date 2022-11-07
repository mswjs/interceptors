module.exports = {
  testRegex: '(?<!browser.*)(\\.test)\\.ts$',
  setupFilesAfterEnv: ['./jest.node.setup.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
}
