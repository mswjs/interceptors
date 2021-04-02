import { IncomingMessage } from 'http'

export function getIncomingMessageBody(res: IncomingMessage): Promise<Buffer> {
  const bufs: Buffer[] = [];

  return new Promise((resolve, reject) => {
    res.once('error', reject)
    res.on('data', (chunk) => bufs.push(chunk))
    res.once('end', () => {
      resolve(Buffer.concat(bufs))
    })
  })
}
