const setup = require('jest-setup-glob')

setup({
  '**.browser.test.ts': './test/jest.browser.setup.ts',
})
