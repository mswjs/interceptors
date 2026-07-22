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

interface SmtpServerLog {
  commands: Array<string>
  messages: Array<string>
}

/**
 * A minimal real SMTP server that supports "AUTH PLAIN", records the
 * received commands and delivered messages, and assigns the queue id
 * "REAL-123" to each delivery.
 */
function createSmtpServer(observed: SmtpServerLog): net.Server {
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

          observed.messages.push(buffer.subarray(0, terminatorIndex).toString('utf8'))
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
        observed.commands.push(line)

        if (command.startsWith('EHLO')) {
          socket.write('250-real.smtp\r\n250 AUTH PLAIN LOGIN\r\n')
        } else if (command.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 Authentication successful\r\n')
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

it('emits client command events while the session is bypassed', async () => {
  const observed: SmtpServerLog = { commands: [], messages: [] }
  await using server = await createRawTestServer(() => createSmtpServer(observed))

  let observedCredentials: { username: string; password: string } | undefined
  let observedSender = ''
  let observedRecipients: Array<string> = []
  let observedMessage = ''

  interceptor.on('session', async ({ client, server: realServer }) => {
    client.on('auth', (event) => {
      observedCredentials = {
        username: event.username,
        password: event.password,
      }
    })
    client.on('message', (event) => {
      observedSender = event.sender
      observedRecipients = event.recipients
      observedMessage = event.message.toString()
    })

    await realServer.connect()
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
    auth: { user: 'app@example.com', pass: 'secret' },
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Hello through the real server!',
  })

  // The client observes the real delivery: the listeners only watched.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as REAL-123')

  // The bypassed session still emits the client command events.
  expect.soft(observedCredentials).toEqual({
    username: 'app@example.com',
    password: 'secret',
  })
  expect.soft(observedSender).toBe('app@example.com')
  expect.soft(observedRecipients).toEqual(['user@example.com'])
  expect.soft(observedMessage).toContain('Hello through the real server!')

  // The real server received the message.
  expect(observed.messages).toHaveLength(1)

  transport.close()
})

it('authors a local verdict for a single command of a bypassed session', async () => {
  const observed: SmtpServerLog = { commands: [], messages: [] }
  await using server = await createRawTestServer(() => createSmtpServer(observed))

  interceptor.on('session', async ({ client, server: realServer }) => {
    // A local verdict withholds the command from the real server
    // and authors the reply in its place.
    client.on('recipient', (event) => {
      if (event.address === 'blocked@example.com') {
        event.reject({ reason: 'Blocked locally' })
      }
    })

    await realServer.connect()
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

  // The client observes the partial delivery: the real verdict for
  // one recipient, the local verdict for the other.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.rejected).toEqual(['blocked@example.com'])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as REAL-123')

  // The real server never saw the locally rejected recipient.
  expect
    .soft(observed.commands.filter((command) => command.startsWith('RCPT')))
    .toEqual(['RCPT TO:<user@example.com>'])
  expect(observed.messages).toHaveLength(1)

  transport.close()
})

it('passes sessions nobody listens to through raw', async () => {
  const observed: SmtpServerLog = { commands: [], messages: [] }
  await using server = await createRawTestServer(() => createSmtpServer(observed))

  // No "session" listeners at all: the connection is not intercepted.
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as REAL-123')
  expect(observed.messages).toHaveLength(1)

  transport.close()
})

it('falls back to mocking when the real server is unreachable', async () => {
  // Reserve a port with no server behind it.
  const deadServer = await createRawTestServer(() => net.createServer())
  const deadPort = deadServer.port
  await deadServer[Symbol.asyncDispose]()

  interceptor.on('session', async ({ client, server }) => {
    try {
      await server.connect()
    } catch {
      client.on('message', (event) => {
        event.accept({ queueId: 'FALLBACK' })
      })
    }
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: deadPort,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  // The dead host never surfaced to the client: the mock greeted
  // once the connection attempt failed.
  expect(info.response).toBe('250 2.0.0 Ok: queued as FALLBACK')

  transport.close()
})
