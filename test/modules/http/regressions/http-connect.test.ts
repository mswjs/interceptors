// @vitest-environment node
import http from 'node:http'
import net from 'node:net'
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.connect('/', (req, res) => {
    console.log('[server] CONNECT!')
    res.status(200).end()
  })

  app.get('/proxy', (req, res) => res.send('hello'))
})

const server = http.createServer((req, res) => {
  if (req.url === '/resource') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.write('one')
    res.write('two')
    res.end('hello world')
    return
  }
})

server.on('connect', (req, clientSocket, head) => {
  console.log('[server] CONNECT!', req.url)

  const { port, hostname } = new URL(`http://${req.url}`)

  console.log(req.url, { port, hostname })

  const socket = net.connect(Number(port || 80), hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    socket.write(head)
    socket.pipe(clientSocket)
    clientSocket.pipe(socket)

    console.log('[server] CONNECT handled!')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await new Promise<void>((resolve) => {
    server.listen(56690, () => resolve())
  })
  // await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  server.close()
  // await httpServer.close()
})

it('mocks a CONNECT request', async () => {
  // interceptor.on('request', ({ request, controller }) => {
  //   console.log('request!', request.method, request.url)

  //   if (request.method === 'CONNECT') {
  //     return controller.respondWith(
  //       new Response(null, {
  //         status: 200,
  //         statusText: 'Connection Established',
  //       })
  //     )
  //   }
  // })

  // interceptor.on('request', ({ request }) => {
  //   console.log('INTERCEPTED', request.method, request.url)
  // })

  const request = http
    .request({
      method: 'CONNECT',
      // host: httpServer.http.address.host,
      // port: httpServer.http.address.port,

      // Path indicates the target URL for the CONNECT request.
      // path: httpServer.http.url('/proxy'),

      host: '127.0.0.1',
      port: 56690,
      path: 'www.google.com:80',
    })
    .end()

  request.on('connect', (response, socket, head) => {
    console.log('[request] CONNECT', response.statusCode, response.url)

    // Once the server handles the "CONNECT" request, the client can communicate
    // with the connected proxy ("path") using the `socket` instance.
    socket.write(
      'GET /resource HTTP/1.1\r\nHost: www.google.com:80\r\nConnection: close\r\n\r\n'
    )

    let chunks: Array<Buffer> = []
    socket.on('data', (chunk) => {
      chunks.push(chunk)
    })
    socket.on('end', () => {
      console.log('BODY:', Buffer.concat(chunks).toString('utf8'))
      request.destroy()
    })
  })

  const { res } = await waitForClientRequest(request)
})
