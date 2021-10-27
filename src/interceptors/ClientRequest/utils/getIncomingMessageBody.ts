import { IncomingMessage } from 'http'
import { Stream } from 'stream'
import * as zlib from 'zlib'

export function getIncomingMessageBody(
  response: IncomingMessage
): Promise<string> {
  let responseBody = ''
  let stream: Stream = response

  if (response.headers['content-encoding'] === 'gzip') {
    stream = response.pipe(zlib.createGunzip())
  }

  return new Promise((resolve, reject) => {
    stream.once('error', (error) => {
      stream.removeAllListeners()
      reject(error)
    })

    stream.on('data', (chunk) => (responseBody += chunk))

    stream.once('end', () => {
      stream.removeAllListeners()
      resolve(responseBody)
    })
  })
}
