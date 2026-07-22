import debug from 'debug'
import { createLogger, formatRequest, formatResponse } from './logger'
import { Interceptor } from '../interceptor'

let previousNamespaces: string
let previousDebugLevel: string | undefined

beforeEach(() => {
  previousNamespaces = debug.disable()
  previousDebugLevel = process.env.DEBUG_LEVEL
  delete process.env.DEBUG_LEVEL
})

afterEach(() => {
  debug.enable(previousNamespaces)

  if (previousDebugLevel === undefined) {
    delete process.env.DEBUG_LEVEL
  } else {
    process.env.DEBUG_LEVEL = previousDebugLevel
  }

  vi.restoreAllMocks()
})

it('writes default logs with a normalized namespace and concise timestamp', () => {
  const writeLog = vi.spyOn(debug, 'log').mockImplementation(() => {
    return undefined
  })
  debug.enable('interceptors:client-request')

  const logger = createLogger('ClientRequest')
  logger.info('apply')
  logger.verbose('socket packet')

  expect(writeLog).toHaveBeenCalledOnce()
  expect(writeLog.mock.calls[0][0]).toMatch(
    /^\d{2}:\d{2}:\d{2}\.\d{3} \u001b\[.*interceptors:client-request.* apply$/
  )
  expect(writeLog.mock.calls[0][0]).toContain('\u001b[')
})

it('writes verbose logs under the interceptor namespace', () => {
  const writeLog = vi.spyOn(debug, 'log').mockImplementation(() => {
    return undefined
  })
  debug.enable('interceptors:xhr')
  process.env.DEBUG_LEVEL = 'verbose'

  const logger = createLogger('xhr')
  logger.info('apply')
  logger.verbose('socket packet')

  expect(writeLog).toHaveBeenCalledTimes(2)
  expect(writeLog.mock.calls[1][0]).toMatch(
    /^\d{2}:\d{2}:\d{2}\.\d{3} .*interceptors:xhr.* socket packet$/
  )
})

it('formats a request as an HTTP message without consuming it', async () => {
  const request = new Request('https://example.com/resource', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'x-example': 'yes',
    },
    body: 'request body',
  })

  await expect(formatRequest(request)).resolves.toBe(
    [
      'POST https://example.com/resource',
      'content-type: text/plain',
      'x-example: yes',
      '',
      'request body',
    ].join('\n')
  )
  await expect(request.text()).resolves.toBe('request body')
})

it('formats a response as an HTTP message without consuming it', async () => {
  const response = new Response('response body', {
    status: 201,
    statusText: 'Created',
    headers: {
      'content-type': 'text/plain',
      'x-example': 'yes',
    },
  })

  await expect(formatResponse(response)).resolves.toBe(
    [
      'HTTP 201 Created',
      'content-type: text/plain',
      'x-example: yes',
      '',
      'response body',
    ].join('\n')
  )
  await expect(response.text()).resolves.toBe('response body')
})

it('omits an unreadable body', async () => {
  const response = new Response('response body')
  await response.text()

  await expect(formatResponse(response)).resolves.toBe(
    ['HTTP 200', 'content-type: text/plain;charset=UTF-8', '', ''].join(
      '\n'
    )
  )
})

it('omits an empty body', async () => {
  const response = new Response('')

  await expect(formatResponse(response)).resolves.toBe(
    ['HTTP 200', 'content-type: text/plain;charset=UTF-8', '', ''].join(
      '\n'
    )
  )
})

it('logs interceptor lifecycle operations', () => {
  const writeLog = vi.spyOn(debug, 'log').mockImplementation(() => {
    return undefined
  })
  debug.enable('interceptors:test')

  class TestInterceptor extends Interceptor<{}> {
    static symbol = Symbol.for('test-interceptor')

    protected predicate(): boolean {
      return true
    }

    protected setup(): void {
      // Intentionally empty.
    }
  }

  const interceptor = new TestInterceptor()
  interceptor.apply()
  interceptor.removeAllListeners()
  interceptor.dispose()

  expect(writeLog).toHaveBeenCalledTimes(3)
  expect(writeLog.mock.calls[0][0]).toMatch(/ apply$/)
  expect(writeLog.mock.calls[1][0]).toContain(' removeAllListeners ')
  expect(writeLog.mock.calls[1][0]).toContain('eventType:')
  expect(writeLog.mock.calls[1][0]).toContain("'*'")
  expect(writeLog.mock.calls[2][0]).toMatch(/ disable$/)
})
