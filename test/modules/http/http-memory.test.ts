// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { HttpServer } from '@open-draft/test-server/http'
import { it, expect, beforeAll, afterAll } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'

const server = new HttpServer((app) => {
  app.get('/', (_req, res) => res.status(200).end())
})

beforeAll(async () => {
  await server.listen()
})

afterAll(async () => {
  await server.close()
})

it(
  'does not retain the MockHttpSocket instance',
  async () => {
    const snapshotPath = path.resolve(__dirname, 'http-memory.heapsnapshot')

    // Spawn the usage scenario in a worker so the test doesn't affect the heap.
    const worker = new Worker(
      path.resolve(__dirname, './http-memory-worker.js'),
      {
        workerData: {
          requestCount: 10_000,
          serverUrl: server.http.url('/'),
          snapshotPath,
        },
        stderr: true,
        stdout: true,
      }
    )

    const completePromise = new DeferredPromise<void>()
    worker.once('message', () => completePromise.resolve())
    worker.on('error', (error) => completePromise.reject(error))

    await completePromise

    const snapshotStats = await fs.promises.stat(snapshotPath)
    expect(snapshotStats.size / 1_000_000).toBeLessThanOrEqual(100)
  },
  { timeout: 10_000 }
)
