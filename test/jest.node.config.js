module.exports = {
  testRegex: '(?<!browser.*)(\\.test)\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
}
