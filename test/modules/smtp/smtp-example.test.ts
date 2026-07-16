// @vitest-environment node
import nodemailer from 'nodemailer'
import { SmtpInterceptor } from '#/src/interceptors/smtp'

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

const SMTP_PORT = 587

it('mocks sending an email via nodemailer', async () => {
  const envelope = {
    from: '',
    recipients: [] as Array<string>,
  }
  let messageData = ''

  interceptor.on('email', ({ socket, connectionOptions, controller }) => {
    // Route by the connection target: mock the SMTP connections,
    // let everything else pass through.
    if (connectionOptions.port !== SMTP_PORT) {
      return controller.passthrough()
    }

    controller.claim()

    const reply = (line: string) => {
      socket.write(`${line}\r\n`)
    }

    const getAddress = (command: string): string => {
      return command.match(/<([^>]*)>/)?.[1] ?? ''
    }

    const handleCommand = (line: string) => {
      const command = line.toUpperCase()

      if (command.startsWith('EHLO') || command.startsWith('HELO')) {
        reply('250-mock.example.com')
        reply('250 8BITMIME')
        return
      }

      if (command.startsWith('MAIL FROM:')) {
        envelope.from = getAddress(line)
        reply('250 2.1.0 Ok')
        return
      }

      if (command.startsWith('RCPT TO:')) {
        envelope.recipients.push(getAddress(line))
        reply('250 2.1.5 Ok')
        return
      }

      if (command.startsWith('DATA')) {
        isReadingData = true
        reply('354 End data with <CR><LF>.<CR><LF>')
        return
      }

      if (command.startsWith('QUIT')) {
        reply('221 2.0.0 Bye')
        socket.end()
        return
      }

      reply('250 Ok')
    }

    let buffer = ''
    let isReadingData = false

    socket.on('data', (chunk) => {
      buffer += chunk.toString()

      while (true) {
        if (isReadingData) {
          const terminatorIndex = buffer.indexOf('\r\n.\r\n')

          if (terminatorIndex === -1) {
            return
          }

          messageData = buffer.slice(0, terminatorIndex)
          buffer = buffer.slice(terminatorIndex + 5)
          isReadingData = false
          reply('250 2.0.0 Ok: queued as MOCKED')
          continue
        }

        const lineEndIndex = buffer.indexOf('\r\n')

        if (lineEndIndex === -1) {
          return
        }

        const line = buffer.slice(0, lineEndIndex)
        buffer = buffer.slice(lineEndIndex + 2)
        handleCommand(line)
      }
    })

    // The mock server speaks first, unblocking the client
    // that awaits the greeting before sending any commands.
    reply('220 mock.example.com ESMTP')
  })

  /**
   * @note Nodemailer resolves the hostname itself (via "dns.lookup")
   * before creating the socket, so the host must be resolvable.
   * No connection is made to it: the socket is claimed by the mock.
   */
  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Hello from the mocked SMTP server!',
  })

  // The client observes a successful email delivery.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.rejected).toEqual([])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as MOCKED')

  // The mock server observes the correct envelope and message.
  expect.soft(envelope.from).toBe('app@example.com')
  expect.soft(envelope.recipients).toEqual(['user@example.com'])
  expect.soft(messageData).toContain('From: app@example.com')
  expect.soft(messageData).toContain('To: user@example.com')
  expect.soft(messageData).toContain('Subject: Hello')
  expect(messageData).toContain('Hello from the mocked SMTP server!')
})
