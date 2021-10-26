module.exports = {
  testTimeout: 30000,
  testRegex: '(?<!browser.*)(\\.test)\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
}
