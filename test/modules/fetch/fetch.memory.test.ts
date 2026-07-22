// @vitest-environment node
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { HttpServer } from '@open-draft/test-server/http'
import { it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const server = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).end()
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  await server.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it(
  'does not retain per-request state after passthrough without listeners',
  async () => {
    const snapshotPath = fileURLToPath(
      new URL('./fetch-memory.heapsnapshot', import.meta.url)
    )

    const worker = new Worker(
      new URL('./fetch-memory-worker.js', import.meta.url),
      {
        workerData: {
          requestCount: 5_000,
          serverUrl: server.http.url('/'),
          snapshotPath,
        },
        stderr: true,
        stdout: true,
      }
    )

    const completePromise = Promise.withResolvers<{ heldRequests: number }>()
    worker.once('message', (message) => {
      completePromise.resolve(message)
    })
    worker.on('error', (error) => {
      completePromise.reject(error)
    })

    const { heldRequests } = await completePromise.promise

    // Sanity check: the worker really did externally root every Request the
    // interceptor created. Otherwise the leak assertion below is meaningless.
    expect(heldRequests).toBeGreaterThanOrEqual(5_000)

    // Count retained per-request artifacts in the heap snapshot. These are
    // internal to the interceptor and have no reason to outlive the response
    // — unless something pins them, like an abort listener that was attached
    // to `request.signal` and never detached. The held requests above ensure
    // such a listener's closure is reachable from a GC root.
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    const nodeTypes = snapshot.snapshot.meta.node_types[0]
    const nodeFields = snapshot.snapshot.meta.node_fields
    const fieldCount = nodeFields.length
    const typeFieldIndex = nodeFields.indexOf('type')
    const nameFieldIndex = nodeFields.indexOf('name')
    const nodes = snapshot.nodes
    const strings = snapshot.strings

    const counts = new Map<string, number>()
    for (let n = 0; n < nodes.length / fieldCount; n++) {
      const type = nodeTypes[nodes[n * fieldCount + typeFieldIndex]]
      if (type !== 'object') {
        continue
      }
      const name = strings[nodes[n * fieldCount + nameFieldIndex]] ?? ''
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }

    fs.rmSync(snapshotPath, { force: true })

    // `RequestController` is pinned by the abort listener's closure
    // (via `options.controller`). If the listener is properly detached
    // after the response, the count should be near zero even though all
    // 5,000 requests are still held. The `requestAbortPromise` resolvers
    // pinned by the same closure cannot be counted here: they are plain
    // `Object`/`Promise` heap nodes with no distinctive class name.
    const requestControllerCount = counts.get('RequestController') ?? 0

    expect(requestControllerCount).toBeLessThan(100)
  },
  30_000
)
