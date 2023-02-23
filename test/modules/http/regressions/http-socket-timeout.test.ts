import { it, expect, beforeAll, afterAll } from 'vitest'
import { ChildProcess, spawn } from 'child_process'

let child: ChildProcess
let stderr = Buffer.from('')

beforeAll(() => {
  child = spawn(
    'yarn',
    [
      'test:integration:node',
      `-c=${require.resolve('./http-socket-timeout.vitest.config.js')}`,
      '--run',
    ],
    {
      cwd: process.cwd(),
    }
  )

  console.log(child.spawnargs.join(' '))

  // Jest writes its output into "stderr".
  child.stderr?.on('data', (buffer: Buffer) => {
    stderr = Buffer.concat([stderr, buffer])
  })
})

afterAll(() => {
  child.kill()
})

it(
  'does not leave the test process hanging due to the custom socket timeout',
  async () => {
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code))
    })

    const testErrors = stderr.toString('utf-8')
    expect(testErrors).toBe(null)

    expect(exitCode).toEqual(0)
  },
  { timeout: 20_000 }
)
