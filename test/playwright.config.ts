import { PlaywrightTestConfig, devices } from '@playwright/test'

const config: PlaywrightTestConfig = {
  testDir: __dirname,
  testMatch: '**/*.browser.test.ts',
  forbidOnly: !!process.env.CI,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  use: {
    trace: 'on-first-retry',
    launchOptions: {
      devtools: !process.env.CI,
      // Some of the browser tests perform HTTPS requests
      // to the locally running test server with a self-signed certificate.
      // Allow those despite the certificate issues.
      args: ['--allow-insecure-localhost'],
    },
  },
  fullyParallel: true,
}

export default config
