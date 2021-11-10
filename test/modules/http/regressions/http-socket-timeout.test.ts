/**
 * @jest-environment node
 */
import * as path from 'path'
import { ChildProcess, spawn } from 'child_process'

jest.setTimeout(20000)

let child: ChildProcess
let stderr = Buffer.from('')

beforeAll(() => {
  const testModulePath = path.resolve(__dirname, 'http-socket-timeout.ts')
  child = spawn('yarn', [
    'test:integration:node',
    testModulePath,
    `--testRegex=${testModulePath}$`,
  ])

  // Jest writes its output into "stderr".
  child.stderr?.on('data', (buffer: Buffer) => {
    stderr = Buffer.concat([stderr, buffer])
  })
})

afterAll(() => {
  child.kill()
})

test('does not leave the test process hanging due to the custom socket timeout', async () => {
  const exitCode = await new Promise<number>((resolve) => {
    child.on('exit', (code: number) => resolve(code))
  })
  expect(exitCode).toEqual(0)

  const testResult = stderr.toString('utf-8')
  expect(testResult).not.toContain(
    'Jest did not exit one second after the test run has completed'
  )
})
