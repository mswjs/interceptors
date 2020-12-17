import { IncomingMessage } from 'http'

export function getIncomingMessageBody(res: IncomingMessage): Promise<string> {
  let responseBody = ''

  return new Promise((resolve, reject) => {
    res.once('error', reject)
    res.on('data', (chunk) => (responseBody += chunk))
    res.once('end', () => {
      resolve(responseBody)
    })
  })
}
