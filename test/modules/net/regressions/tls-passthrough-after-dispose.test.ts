// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/869
 */
import { ChildProcess, spawn } from 'node:child_process'

let child: ChildProcess
let stderr = Buffer.from('')

beforeAll(() => {
  child = spawn('node_modules/.bin/vitest', [
    'run',
    `--config=${require.resolve('./tls-passthrough-after-dispose.vitest.config.js')}`,
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

it('does not crash the process passing through a tls socket after the interceptor is disposed', async () => {
  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code))
  })

  const testErrors = stderr.toString('utf-8')

  // Starting the handshake twice on the same "TLSWrap" crashes the
  // process with a native, uncatchable assertion.
  expect(testErrors).not.toContain('Assertion failed: !wrap->started_')
  expect(testErrors).toBe('')
  expect(exitCode).toEqual(0)
}, 15_000)
