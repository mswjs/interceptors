import { parentPort, workerData } from 'node:worker_threads'
import { setTimeout as delay } from 'node:timers/promises'
import { writeHeapSnapshot } from 'node:v8'

const { requestCount, serverUrl, snapshotPath } = workerData
const CONCURRENCY = 20

// Externally root every `Request` instance the interceptor creates. Under real
// production traffic, undici's connection pool / performance entries / dispatch
// records do this transitively. Doing it explicitly here makes the test
// deterministic: if the interceptor leaves an `abort` listener attached to
// `request.signal`, that listener's closure pins the per-request `RequestController`
// and `DeferredPromise` instances through the held request, and they show up in
// the heap snapshot. With the listener properly detached after the response, the
// closure (and everything it captured) is collectable even though the request
// itself is still held.
const heldRequests = new Set()
const OriginalRequest = globalThis.Request
class HeldRequest extends OriginalRequest {
  constructor(input, init) {
    super(input, init)
    heldRequests.add(this)
  }
}
globalThis.Request = HeldRequest

// IMPORTANT: import the interceptor only AFTER patching `globalThis.Request` so
// that `class FetchRequest extends Request` resolves to `HeldRequest`.
const { FetchInterceptor } = await import('@mswjs/interceptors/fetch')

const interceptor = new FetchInterceptor()
interceptor.apply()

function fireBatch(count, concurrency) {
  let inflight = 0
  let started = 0
  let failed = false

  return new Promise((resolve, reject) => {
    const next = () => {
      if (failed) {
        return
      }
      if (started >= count && inflight === 0) {
        resolve()
        return
      }
      while (inflight < concurrency && started < count) {
        started++
        inflight++
        fetch(serverUrl)
          .then((response) => response.text())
          .catch((error) => {
            failed = true
            reject(error)
          })
          .finally(() => {
            inflight--
            next()
          })
      }
    }
    next()
  })
}

async function forceGc() {
  for (let i = 0; i < 6; i++) {
    global.gc?.()
    await delay(30)
  }
}

;(async () => {
  await fireBatch(requestCount, CONCURRENCY)
  await delay(2000)
  await forceGc()
  await delay(1000)
  await forceGc()
  writeHeapSnapshot(snapshotPath)
  parentPort.postMessage({ heldRequests: heldRequests.size })
})().catch((error) => {
  console.error(error)
  parentPort.postMessage({ error: error.message })
})
