const v8 = require('node:v8')
const path = require('node:path')
const http = require('node:http')
const { workerData, parentPort } = require('node:worker_threads')
const {
  ClientRequestInterceptor,
} = require('../../../lib/interceptors/ClientRequest')

const interceptor = new ClientRequestInterceptor()
interceptor.apply()

const pendingRequests = []

for (let i = 0; i < workerData.requestCount; i++) {
  pendingRequests.push(
    new Promise((resolve, reject) => {
      http
        .get(workerData.serverUrl, (response) => {
          response.on('data', () => {})
          response.on('error', (error) => reject(error))
          response.on('end', () => resolve())
        })
        .on('error', (error) => reject(error))
    })
  )
}

globalThis.gc?.()
v8.writeHeapSnapshot(workerData.snapshotPath)

Promise.allSettled(pendingRequests).then(() => {
  parentPort.postMessage('complete')
})
