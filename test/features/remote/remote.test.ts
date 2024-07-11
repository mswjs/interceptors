import { it, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import { spawn } from 'child_process'
import { RemoteHttpResolver } from '../../../src/RemoteHttpInterceptor'

const CHILD_PATH = path.resolve(__dirname, 'child.js')

const child = spawn('node', [CHILD_PATH], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
})

const resolver = new RemoteHttpResolver({
  process: child,
})

resolver.on('request', ({ controller }) => {
  controller.respondWith(
    new Response(
      JSON.stringify({
        mockedFromParent: true,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  )
})

beforeAll(() => {
  resolver.apply()
})

afterAll(() => {
  if (!child.killed) {
    child.kill()
  }

  resolver.dispose()
})

it('intercepts an HTTP request made in a child process', async () => {
  child.send('make:request')

  const response = await new Promise((resolve, reject) => {
    child.addListener('message', (message) => {
      if (typeof message !== 'string' || !message.startsWith('done:')) {
        return
      }

      const [, responseString] = message.match(/^done:(.+)$/) || []
      resolve(JSON.parse(responseString))
    })
    child.addListener('error', reject)
    child.addListener('exit', reject)
  })

  expect(response).toEqual({ mockedFromParent: true })
})
