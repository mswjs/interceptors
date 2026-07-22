// @vitest-environment node
import net from 'node:net'
import nodemailer from 'nodemailer'
import { SmtpInterceptor } from '#/src/interceptors/smtp'
import { createRawTestServer } from '#/test/helpers'

const interceptor = new SmtpInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

/**
 * A minimal real SMTP server that accepts everything, rejects the
 * recipient "blocked@example.com", and assigns the queue id "REAL-123"
 * to the delivered message.
 */
function createSmtpServer(): net.Server {
  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    let isReadingData = false

    socket.write('220 real.smtp ESMTP\r\n')

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      while (true) {
        if (isReadingData) {
          const terminatorIndex = buffer.indexOf('\r\n.\r\n')

          if (terminatorIndex === -1) {
            return
          }

          buffer = buffer.subarray(terminatorIndex + 5)
          isReadingData = false
          socket.write('250 2.0.0 Ok: queued as REAL-123\r\n')
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
          socket.write('250-real.smtp\r\n250 AUTH PLAIN LOGIN\r\n')
        } else if (command.startsWith('HELO')) {
          socket.write('250 real.smtp\r\n')
        } else if (command.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 Ok\r\n')
        } else if (command.startsWith('RCPT TO')) {
          if (line.includes('blocked@example.com')) {
            socket.write('550 5.1.1 No such user\r\n')
          } else {
            socket.write('250 2.1.5 Ok\r\n')
          }
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

it('observes the real server delivery outcome on passthrough', async () => {
  await using server = await createRawTestServer(createSmtpServer)

  const observedEvents: Array<string> = []
  let observedMessageCode = 0
  let observedQueueId: string | undefined
  let observedCapabilities: Array<string> = []
  const observedRecipients: Array<{ address: string; code: number }> = []

  interceptor.on('session', async ({ server }) => {
    server.on('greeting', (event) => {
      observedEvents.push('greeting')
      expect(event.code).toBe(220)
    })
    server.on('helo', (event) => {
      observedEvents.push('helo')
      observedCapabilities = event.capabilities
    })
    server.on('sender', () => {
      observedEvents.push('sender')
    })
    server.on('recipient', (event) => {
      observedEvents.push('recipient')
      observedRecipients.push({ address: event.address, code: event.code })
    })
    server.on('data', () => {
      observedEvents.push('data')
    })
    server.on('message', (event) => {
      observedEvents.push('message')
      observedMessageCode = event.code
      observedQueueId = event.queueId
    })

    // Connecting before the greeting bypasses the session
    // to the real server.
    await server.connect()
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Hello from the real SMTP server!',
  })

  // The client observes the real server's successful delivery, verbatim.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.rejected).toEqual([])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as REAL-123')

  // The passthrough session observes the real server's replies.
  expect
    .soft(observedEvents)
    .toEqual(['greeting', 'helo', 'sender', 'recipient', 'data', 'message'])
  expect.soft(observedCapabilities).toEqual(['AUTH PLAIN LOGIN'])
  expect
    .soft(observedRecipients)
    .toEqual([{ address: 'user@example.com', code: 250 }])
  expect.soft(observedMessageCode).toBe(250)
  expect(observedQueueId).toBe('REAL-123')

  transport.close()
})

it('observes the real per-recipient verdicts of a partial delivery', async () => {
  await using server = await createRawTestServer(createSmtpServer)

  const observedRecipients: Array<{ address: string; code: number }> = []

  interceptor.on('session', async ({ server }) => {
    server.on('recipient', (event) => {
      observedRecipients.push({ address: event.address, code: event.code })
    })

    await server.connect()
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: ['user@example.com', 'blocked@example.com'],
    subject: 'Hello',
    text: 'Partial delivery',
  })

  // The client observes the real server's partial delivery.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.rejected).toEqual(['blocked@example.com'])

  // The passthrough session observes each real recipient verdict.
  expect(observedRecipients).toEqual([
    { address: 'user@example.com', code: 250 },
    { address: 'blocked@example.com', code: 550 },
  ])

  transport.close()
})

it('withholds a real reply and substitutes it through the controller', async () => {
  await using server = await createRawTestServer(createSmtpServer)

  interceptor.on('session', async ({ client, server }) => {
    server.on('message', (event) => {
      // The real server accepted the message ("250 ... REAL-123"),
      // but withhold that reply and reject the delivery to the client.
      expect(event.code).toBe(250)
      event.preventDefault()
      client.reply(550, '5.7.1 Blocked by policy')
    })

    await server.connect()
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
  })

  const sendResult = transport
    .sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'This delivery gets rewritten',
    })
    .then(() => null)
    .catch((error) => error)

  const error = await sendResult

  // The client observes the substituted rejection, not the real "250".
  expect(error).toBeInstanceOf(Error)
  expect(error.responseCode).toBe(550)
  expect(error.response).toContain('5.7.1 Blocked by policy')

  transport.close()
})

it('abruptly terminates the connection via the real server', async () => {
  await using server = await createRawTestServer(createSmtpServer)

  interceptor.on('session', async ({ server }) => {
    // Kill the upstream connection the moment the real server greets.
    server.on('greeting', () => {
      server.destroy()
    })

    await server.connect()
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
  })

  const error = await transport
    .sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'This never gets delivered',
    })
    .then(() => null)
    .catch((error) => error)

  // The client observes the upstream connection dropping (Nodemailer
  // surfaces a socket-level drop as its "ESOCKET" error category).
  expect(error).toBeInstanceOf(Error)
  expect(error.code).toBe('ESOCKET')

  transport.close()
})

it('gracefully closes the connection via the real server', async () => {
  await using server = await createRawTestServer(createSmtpServer)

  interceptor.on('session', async ({ server }) => {
    // Close the upstream connection right after the greeting.
    server.on('greeting', () => {
      server.close()
    })

    await server.connect()
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
  })

  const error = await transport
    .sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'This never gets delivered',
    })
    .then(() => null)
    .catch((error) => error)

  // The client observes the upstream ending the session.
  expect(error).toBeInstanceOf(Error)

  transport.close()
})
