/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { ChildProcess, spawn } from 'child_process'

let child: ChildProcess
let stderr = Buffer.from('')

beforeAll(() => {
  child = spawn('node_modules/.bin/vitest', [
    'run',
    `--config=${require.resolve('./http-socket-timeout.vitest.config.js')}`,
  ])

  child.stderr?.on('data', (buffer: Buffer) => {
    /**
     * @note @fixme Skip Vite's CJS build deprecation message.
     * Remove this once the Interceptors are ESM-only.
     */
    if (buffer.toString('utf8').includes('Vite')) {
      return
    }

    stderr = Buffer.concat([stderr, buffer])
  })
})

afterAll(() => {
  child.kill()
})

it('does not leave the test process hanging due to the custom socket timeout', async () => {
  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code))
  })

  const testErrors = stderr.toString('utf-8')

  expect(testErrors).toBe('')
  expect(exitCode).toEqual(0)
}, 10_000)
