import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: /\.browser\.test\.ts$/,
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
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
})
