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
  },
  fullyParallel: true,
}

export default config
