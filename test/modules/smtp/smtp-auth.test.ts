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

it('authenticates the client', async () => {
  const authenticationListener = vi.fn()

  interceptor.on('session', ({ client }) => {
    // The "auth" event fires once the challenge/response
    // exchange of the chosen mechanism collects the credentials.
    client.on('auth', (event) => {
      authenticationListener({
        method: event.method,
        username: event.username,
        password: event.password,
      })
      event.accept()
    })

    client.on('message', (event) => {
      event.accept()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: 'app@example.com',
      pass: 'supersecret',
    },
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect(authenticationListener).toHaveBeenCalledExactlyOnceWith({
    method: 'PLAIN',
    username: 'app@example.com',
    password: 'supersecret',
  })
})

it('authenticates the client with the multi-step "LOGIN" mechanism', async () => {
  const authenticationListener = vi.fn()

  interceptor.on('session', ({ client }) => {
    client.on('auth', (event) => {
      authenticationListener({
        method: event.method,
        username: event.username,
        password: event.password,
      })
      event.accept()
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    authMethod: 'LOGIN',
    auth: {
      user: 'app@example.com',
      pass: 'supersecret',
    },
  })

  await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Hello',
  })

  expect(authenticationListener).toHaveBeenCalledExactlyOnceWith({
    method: 'LOGIN',
    username: 'app@example.com',
    password: 'supersecret',
  })
})

it('rejects invalid credentials', async () => {
  interceptor.on('session', ({ client }) => {
    client.on('auth', (event) => {
      if (event.password === 'valid') {
        event.accept()
      } else {
        event.reject({ reason: 'Invalid username or password' })
      }
    })
  })

  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: 'app@example.com',
      pass: 'wrong',
    },
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EAUTH',
    responseCode: 535,
    response: '535 5.7.8 Invalid username or password',
  })
})
