import { ChildProcess, spawn } from 'child_process'

jest.setTimeout(20000)

let child: ChildProcess
let stderr = Buffer.from('')

beforeAll(() => {
  child = spawn('yarn', [
    'test:integration:node',
    'test/regressions/http-timeout.ts',
    '--testRegex=/test/regressions/http-timeout.ts$',
  ])

  // Jest writes its output into "stderr".
  child.stderr?.on('data', (buffer: Buffer) => {
    stderr = Buffer.concat([stderr, buffer])
  })
})

afterAll(() => {
  child.kill()
})

it('does not leave the test process hanging due to the custom socket timeout', async () => {
  const exitCode = await new Promise<number>((resolve) => {
    child.on('exit', (code: number) => resolve(code))
  })
  expect(exitCode).toEqual(0)

  const testResult = stderr.toString('utf-8')
  expect(testResult).not.toContain(
    'Jest did not exit one second after the test run has completed'
  )
})
