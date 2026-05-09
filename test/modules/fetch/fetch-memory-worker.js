const v8 = require('node:v8')
const vm = require('node:vm')
const { workerData, parentPort } = require('node:worker_threads')
const {
  FetchInterceptor,
} = require('../../../lib/node/interceptors/fetch/index.cjs')

// Workers don't accept --expose-gc via execArgv; toggle the flag at runtime.
v8.setFlagsFromString('--expose_gc')
const gc = vm.runInNewContext('gc')

const interceptor = new FetchInterceptor()
interceptor.apply()

// No listeners attached — this is the regression surface.
;(async () => {
  const concurrency = 20
  let done = 0
  async function workerLoop() {
    while (done < workerData.requestCount) {
      const i = done++
      if (i >= workerData.requestCount) break
      const response = await fetch(`${workerData.serverUrl}?i=${i}`)
      await response.text()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => workerLoop()))

  // Interleave GCs with setImmediate so FinalizationRegistry callbacks
  // (which run on the next microtask tick) get a chance to release native
  // handles before we snapshot.
  const tick = () => new Promise((r) => setImmediate(r))
  for (let i = 0; i < 5; i++) {
    gc()
    await tick()
  }

  v8.writeHeapSnapshot(workerData.snapshotPath)

  parentPort.postMessage('complete')
})().catch((error) => {
  parentPort.postMessage({ error: error?.message ?? String(error) })
})
