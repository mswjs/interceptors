// @vitest-environment node
import net from 'node:net'
import http from 'node:http'
import { createRequire } from 'node:module'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { SmtpInterceptor } from '#/src/interceptors/smtp'
import { createTestServer } from '#/test/helpers'

/**
 * Resend offers two transports for sending emails:
 *
 * 1. The REST API ("https://api.resend.com"), used by the "resend" SDK.
 *    That is plain HTTPS, not SMTP (see the REST API test below).
 * 2. The SMTP relay ("smtp.resend.com"), used through SMTP clients
 *    like Nodemailer with the fixed username "resend" and the API key
 *    as the password.
 *
 * The SMTP interceptor concerns the SMTP relay.
 * @see https://resend.com/docs/send-with-smtp
 */

const RESEND_API_KEY = 're_123456789'

const interceptor = new SmtpInterceptor()

interface NodemailerDnsCacheEntry {
  value: {
    addresses: Array<string>
    servername: string
  }
  expires: number
}

const nodemailerShared: {
  dnsCache: Map<string, NodemailerDnsCacheEntry>
} = createRequire(import.meta.url)('nodemailer/lib/shared')

beforeAll(() => {
  interceptor.apply()

  /**
   * @note Nodemailer resolves hostnames itself (via "dns.resolve")
   * before creating the socket. Prime its DNS cache so
   * "smtp.resend.com" maps to the loopback address and the tests
   * never perform a real DNS query.
   */
  nodemailerShared.dnsCache.set('smtp.resend.com', {
    value: {
      addresses: ['127.0.0.1'],
      servername: 'smtp.resend.com',
    },
    expires: Infinity,
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
  nodemailerShared.dnsCache.delete('smtp.resend.com')
})

/**
 * A Nodemailer transport configured for the Resend SMTP relay the way
 * Resend documents it: the fixed username "resend" and the API key as
 * the password.
 */
function createResendTransport(port: number) {
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port,
    secure: false,
    auth: {
      user: 'resend',
      pass: RESEND_API_KEY,
    },
  })
}

/**
 * A minimal local stand-in for the Resend SMTP relay: authenticates
 * the "resend" user by the API key, records the delivered messages,
 * and assigns the queue id "RESEND-REAL" to each delivery.
 */
function createResendSmtpServer(deliveredMessages: Array<string>): net.Server {
  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    let isReadingData = false

    socket.write('220 smtp.resend.com ESMTP\r\n')

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      while (true) {
        if (isReadingData) {
          const terminatorIndex = buffer.indexOf('\r\n.\r\n')

          if (terminatorIndex === -1) {
            return
          }

          deliveredMessages.push(
            buffer.subarray(0, terminatorIndex).toString('utf8')
          )
          buffer = buffer.subarray(terminatorIndex + 5)
          isReadingData = false
          socket.write('250 2.0.0 Ok: queued as RESEND-REAL\r\n')
          continue
        }

        const lineEndIndex = buffer.indexOf('\r\n')

        if (lineEndIndex === -1) {
          return
        }

        const line = buffer.subarray(0, lineEndIndex).toString('utf8')
        buffer = buffer.subarray(lineEndIndex + 2)
        const command = line.toUpperCase()

        if (command.startsWith('EHLO')) {
          socket.write('250-smtp.resend.com\r\n250 AUTH PLAIN LOGIN\r\n')
        } else if (command.startsWith('AUTH PLAIN')) {
          const encodedCredentials = line.slice('AUTH PLAIN '.length)
          const [, username, password] = Buffer.from(
            encodedCredentials,
            'base64'
          )
            .toString('utf8')
            .split('\u0000')

          if (username === 'resend' && password === RESEND_API_KEY) {
            socket.write('235 2.7.0 Authentication successful\r\n')
          } else {
            socket.write('535 5.7.8 Invalid username or password\r\n')
          }
        } else if (command.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 Ok\r\n')
        } else if (command.startsWith('RCPT TO')) {
          socket.write('250 2.1.5 Ok\r\n')
        } else if (command.startsWith('DATA')) {
          isReadingData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (command.startsWith('QUIT')) {
          socket.write('221 2.0.0 Bye\r\n')
          socket.end()
        } else {
          socket.write('250 2.0.0 Ok\r\n')
        }
      }
    })
  })
}

it('passes through emails sent via the Resend REST API', async () => {
  await using server = await createTestServer(() => {
    return http.createServer((request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        connection: 'close',
      })
      response.end(JSON.stringify({ id: 'mocked-email-id' }))
    })
  })

  const sessionListener = vi.fn()

  interceptor.on('session', ({ session, passthrough }) => {
    sessionListener(session.url.href)
    passthrough()
  })

  const resend = new Resend(RESEND_API_KEY, {
    baseUrl: `http://127.0.0.1:${server.port}`,
  })

  const response = await resend.emails.send({
    from: 'App <app@example.com>',
    to: ['user@example.com'],
    subject: 'Hello',
    text: 'Hello from the Resend SDK!',
  })

  // The SDK delivers the email over HTTPS ("api.resend.com"), not
  // SMTP. Mock the SDK with the fetch/ClientRequest interceptors.
  expect.soft(response.error).toBeNull()
  expect.soft(response.data).toEqual({ id: 'mocked-email-id' })

  /**
   * @note SMTP is a server-greets-first protocol, so the "session"
   * event fires for every intercepted connection before any bytes
   * flow — including the SDK's REST traffic. Listeners must decide
   * by the session URL (e.g. the SMTP relay ports) and pass through
   * everything else. Sessions with no listener pass through on
   * their own.
   */
  expect(sessionListener).toHaveBeenCalledExactlyOnceWith(
    `smtp://127.0.0.1:${server.port}`
  )
})

it('mocks an email sent through the Resend SMTP relay', async () => {
  const observedSessionUrls: Array<string> = []
  let observedCredentials: { username: string; password: string } | undefined
  let observedMessage = ''

  interceptor.on('session', ({ session, client }) => {
    observedSessionUrls.push(session.url.href)

    client.on('auth', (event) => {
      observedCredentials = {
        username: event.username,
        password: event.password,
      }
      event.accept()
    })

    client.on('message', (event) => {
      observedMessage = event.message.toString()
      event.accept({ queueId: 'MOCKED' })
    })
  })

  const transport = createResendTransport(587)

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Hello from the mocked Resend relay!',
  })

  // The client observes a successful delivery without any connection
  // (or a real API key): the entire session is mocked.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as MOCKED')

  // The mock server observes the Resend relay credentials.
  expect.soft(observedCredentials).toEqual({
    username: 'resend',
    password: RESEND_API_KEY,
  })
  expect.soft(observedMessage).toContain('Subject: Hello')
  expect.soft(observedMessage).toContain('Hello from the mocked Resend relay!')

  /**
   * @note Nodemailer connects to the resolved address, so the session
   * URL reflects the IP, not "smtp.resend.com". Match Resend sessions
   * by the relay port (587/465/2587/2465) or intercept the resolution.
   */
  expect(observedSessionUrls).toEqual(['smtp://127.0.0.1:587'])

  transport.close()
})

it('observes the delivery through the Resend SMTP relay on passthrough', async () => {
  const deliveredMessages: Array<string> = []

  await using server = await createTestServer(() => {
    return createResendSmtpServer(deliveredMessages)
  })

  const observedEvents: Array<string> = []
  let observedQueueId: string | undefined

  interceptor.on('session', async ({ server }) => {
    server.on('greeting', () => {
      observedEvents.push('greeting')
    })
    server.on('helo', () => {
      observedEvents.push('helo')
    })
    server.on('auth', (event) => {
      observedEvents.push('auth')
      expect(event.code).toBe(235)
    })
    server.on('sender', () => {
      observedEvents.push('sender')
    })
    server.on('recipient', () => {
      observedEvents.push('recipient')
    })
    server.on('data', () => {
      observedEvents.push('data')
    })
    server.on('message', (event) => {
      observedEvents.push('message')
      observedQueueId = event.queueId
    })

    await server.connect()
  })

  const transport = createResendTransport(server.port)

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Hello through the real Resend relay!',
  })

  // The client observes the relay's delivery outcome, verbatim.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as RESEND-REAL')

  // The passthrough session observes the entire relay exchange,
  // including the authentication.
  expect
    .soft(observedEvents)
    .toEqual([
      'greeting',
      'helo',
      'auth',
      'sender',
      'recipient',
      'data',
      'message',
    ])
  expect.soft(observedQueueId).toBe('RESEND-REAL')

  // The relay received the message.
  expect(deliveredMessages).toHaveLength(1)

  transport.close()
})

it('surgically overrides the relay reply on passthrough', async () => {
  const deliveredMessages: Array<string> = []

  await using server = await createTestServer(() => {
    return createResendSmtpServer(deliveredMessages)
  })

  interceptor.on('session', async ({ client, server }) => {
    server.on('message', (event) => {
      // The relay accepted the delivery ("250 ... RESEND-REAL"), but
      // withhold that reply and reject the delivery to the client.
      expect(event.code).toBe(250)
      event.preventDefault()
      client.reply(550, '5.7.1 Suppressed by test policy')
    })

    await server.connect()
  })

  const transport = createResendTransport(server.port)

  const error = await transport
    .sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'This delivery gets rewritten',
    })
    .then(() => null)
    .catch((error) => error)

  // The client observes the substituted rejection, not the real "250".
  expect.soft(error).toBeInstanceOf(Error)
  expect.soft(error.responseCode).toBe(550)
  expect.soft(error.response).toContain('5.7.1 Suppressed by test policy')

  // The relay still received and accepted the message.
  expect(deliveredMessages).toHaveLength(1)

  transport.close()
})
