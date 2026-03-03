import { DeferredPromise } from '@open-draft/deferred-promise'
import { Worker } from 'node:worker_threads'

export async function runServeSnippet(snippet: string) {
  const worker = new Worker(snippet, {
    eval: true,
  })
  const pendingResult = new DeferredPromise()

  worker
    .once('message', (message) => {
      pendingResult.resolve(message)
      worker.terminate()
    })
    .on('error', (error) => pendingResult.reject(error))

  return pendingResult
}
