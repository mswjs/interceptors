import * as path from 'path'
import { spawn } from 'child_process'
import { createRemoteResolver } from '../../../src'

const CHILD_PATH = path.resolve(__dirname, 'child.js')

const child = spawn('node', [CHILD_PATH], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
})

createRemoteResolver({
  process: child,
  resolver() {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mockedFromParent: true,
      }),
    }
  },
})

afterAll(() => {
  if (!child.killed) {
    child.kill()
  }
})

test('intercepts an HTTP request made in a child process', async () => {
  child.send('make:request')

  const response = await new Promise((resolve, reject) => {
    child.addListener('message', (message) => {
      if (typeof message !== 'string') {
        return
      }

      if (message.startsWith('done:')) {
        const [, responseString] = message.match(/^done:(.+)$/) || []
        resolve(JSON.parse(responseString))
      }
    })
    child.addListener('error', reject)
    child.addListener('exit', reject)
  })

  expect(response).toEqual({ mockedFromParent: true })
})
