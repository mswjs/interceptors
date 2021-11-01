module.exports = {
  testTimeout: 10000,
  testRegex: '(?<!browser.*)(\\.test)\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
}
