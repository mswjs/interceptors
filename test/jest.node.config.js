module.exports = {
  testTimeout: 60000,
  testRegex: '(?<!browser.*)(\\.test)\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
}
