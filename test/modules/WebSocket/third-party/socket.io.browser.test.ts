import { test, expect } from '../../../playwright.extend'
import { Server } from 'socket.io'
import type { io } from 'socket.io-client'
import type { Encoder, Decoder } from 'socket.io-parser'
import type { encodePacket, decodePacket } from 'engine.io-parser'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import type { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

declare global {
  interface Window {
    io: typeof io
    encoder: Encoder
    decoder: Decoder
    encodePacket: typeof encodePacket
    decodePacket: typeof decodePacket
    interceptor: WebSocketInterceptor
  }
}

const httpServer = new HttpServer()
const wsServer = new Server(httpServer['_http'], {
  transports: ['websocket'],
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('intercepts and modifies data sent to socket.io server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./socket.io.runtime.js'), {
    /**
     * @note The WebSocket interceptor must be applied
     * before "socket.io-client" is evaluated. SocketIO
     * hoists the global WebSocket class so it cannot
     * be patched by the interceptor.
     */
    markup: `
<script src="https://cdn.socket.io/4.7.4/socket.io.min.js" integrity="sha384-Gr6Lu2Ajx28mzwyVR8CFkULdCU7kMlZ9UthllibdOSo6qAiN+yXNHqtgdTvFXMT4" crossorigin="anonymous" defer>
</script>
    `,
  })

  const serverMessagePromise = new DeferredPromise<string>()
  wsServer.on('connection', (socket) => {
    socket.on('message', (data) => {
      serverMessagePromise.resolve(data)
    })
  })

  await page.evaluate((url) => {
    const { io, interceptor, encoder, encodePacket, decodePacket, decoder } =
      window

    const decodeMessage = (
      // @ts-expect-error
      encodedEngineIoPacket
    ) => {
      const decodedEngineIoPacket = decodePacket(encodedEngineIoPacket)

      if (decodedEngineIoPacket.type !== 'message') {
        return
      }
      const decodedSocketIoPacket = decoder['decodeString'](
        decodedEngineIoPacket.data
      )
      /**
       * @note You should reference "PacketType.EVENT"
       * from "socket.io-parser" here but can't pass
       * that through Playwright.
       */
      if (decodedSocketIoPacket.type !== 2) {
        return
      }

      return decodedSocketIoPacket.data.slice(1)
    }

    const encodeMessage = async (data) => {
      return new Promise((resolve) => {
        encodePacket(
          {
            type: 'message', // 4
            data: encoder.encode({
              type: 2,
              /**
               * @noto Not sure if prepending "message"
               * manually is correct. Either encoder doesn't
               * do that though.
               */
              data: ['message', data],
              nsp: '/',
            }),
          },
          true,
          (encodedEngineIoPacket) => {
            resolve(encodedEngineIoPacket)
          }
        )
      })
    }

    interceptor.on('connection', ({ client, server }) => {
      server.connect()

      client.addEventListener('message', async (event) => {
        const data = decodeMessage(event.data)

        if (data?.[0] === 'hello') {
          event.preventDefault()
          const packet = await encodeMessage('mocked hello!')
          // @ts-expect-error TS in Playwright is hard.
          server.send(packet)
        }
      })
    })

    const ws = io(url, {
      transports: ['websocket'],
    })

    ws.on('connect', () => {
      ws.send('hello')
    })
  }, httpServer.http.address.href)

  expect(await serverMessagePromise).toBe('mocked hello!')
})
