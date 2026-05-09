// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { HttpServer } from '@open-draft/test-server/http'
import { it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { FetchInterceptor } from '../../../src/interceptors/fetch'

const server = new HttpServer((app) => {
  app.get('/', (_req, res) => res.status(200).end())
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

it('detaches the abort listener from request.signal after the request resolves', async () => {
  // Under sustained traffic, undici-side state can transitively keep the
  // request's AbortSignal reachable after fetch returns. If the abort
  // listener is left attached, its closure pins per-request scope and
  // eventually compounds into hundreds of MB of native memory growth.
  // See https://github.com/PatrikBird/mswjs-interceptors-leak-repro
  // Capture the abort listener that handleRequest attaches and verify it is
  // detached again before the request resolves. We can't assert "all abort
  // listeners on the signal are removed" because undici attaches its own
  // listeners that it manages independently.
  const addedAbortListeners = new Set<EventListenerOrEventListenerObject>()
  const removedAbortListeners = new Set<EventListenerOrEventListenerObject>()
  const originalAdd = AbortSignal.prototype.addEventListener
  const originalRemove = AbortSignal.prototype.removeEventListener
  AbortSignal.prototype.addEventListener = function (type, listener, opts) {
    if (type === 'abort' && listener) addedAbortListeners.add(listener)
    return originalAdd.call(this, type, listener, opts)
  }
  AbortSignal.prototype.removeEventListener = function (type, listener, opts) {
    if (type === 'abort' && listener) removedAbortListeners.add(listener)
    return originalRemove.call(this, type, listener, opts)
  }

  try {
    const response = await fetch(server.http.url('/'))
    await response.text()

    expect(addedAbortListeners.size).toBeGreaterThan(0)
    // At least one of the abort listeners that was added during the request
    // must also have been removed — the interceptor's own listener.
    const detached = [...addedAbortListeners].filter((l) =>
      removedAbortListeners.has(l)
    )
    expect(detached.length).toBeGreaterThan(0)
  } finally {
    AbortSignal.prototype.addEventListener = originalAdd
    AbortSignal.prototype.removeEventListener = originalRemove
  }
})

it(
  'does not retain Request instances after passthrough without listeners',
  async () => {
    const snapshotPath = path.resolve(__dirname, 'fetch-memory.heapsnapshot')

    const worker = new Worker(
      path.resolve(__dirname, './fetch-memory-worker.js'),
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

    const completePromise = new DeferredPromise<void>()
    worker.once('message', () => completePromise.resolve())
    worker.on('error', (error) => completePromise.reject(error))

    await completePromise

    // Scan the heap snapshot for retained Request / FetchRequest instances.
    const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    const types = snap.snapshot.meta.node_types[0]
    const fields = snap.snapshot.meta.node_fields
    const FC = fields.length
    const TYPE_IDX = fields.indexOf('type')
    const NAME_IDX = fields.indexOf('name')
    const nodes = snap.nodes
    const strings = snap.strings

    let requestLikeCount = 0
    for (let n = 0; n < nodes.length / FC; n++) {
      const type = types[nodes[n * FC + TYPE_IDX]]
      const name = strings[nodes[n * FC + NAME_IDX]] ?? ''
      if (
        type === 'object' &&
        (name === 'Request' || name === 'FetchRequest')
      ) {
        requestLikeCount++
      }
    }

    fs.rmSync(snapshotPath, { force: true })

    // After 5,000 fetches with no listeners, only a small number of in-flight
    // / FinalizationRegistry-pending Request instances should remain. The
    // regression retains thousands.
    expect(requestLikeCount).toBeLessThan(100)
  },
  { timeout: 30_000 }
)
