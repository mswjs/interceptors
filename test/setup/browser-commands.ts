import type { BrowserCommand } from 'vitest/node'
import type { ConsoleMessage, Page } from 'playwright'
// Import the "BrowserCommandContext" augmentation so "context.page" is typed.
import type {} from '@vitest/browser-playwright'

interface BrowserConsoleMessage {
  type: ReturnType<ConsoleMessage['type']>
  text: string
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Start recording the messages the browser itself prints
     * to the console (e.g. "Refused to set unsafe header").
     * Those never go through the page's `console` object,
     * so they cannot be spied on from within the test.
     */
    spyOnBrowserConsole: () => Promise<void>
    /**
     * Return the browser console messages recorded
     * since the last `spyOnBrowserConsole()` call.
     */
    getBrowserConsoleMessages: () => Promise<Array<BrowserConsoleMessage>>
  }
}

const recordedMessages = new WeakMap<Page, Array<BrowserConsoleMessage>>()

const spyOnBrowserConsole: BrowserCommand<[]> = ({ page }) => {
  if (!recordedMessages.has(page)) {
    page.on('console', (message) => {
      recordedMessages.get(page)?.push({
        type: message.type(),
        text: message.text(),
      })
    })
  }

  recordedMessages.set(page, [])
}

const getBrowserConsoleMessages: BrowserCommand<
  [],
  Array<BrowserConsoleMessage>
> = ({ page }) => {
  return recordedMessages.get(page) ?? []
}

export const browserCommands = {
  spyOnBrowserConsole,
  getBrowserConsoleMessages,
}
