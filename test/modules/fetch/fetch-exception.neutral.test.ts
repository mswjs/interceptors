import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => void 0)
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  vi.restoreAllMocks()
  interceptor.dispose()
})

it('treats middleware exceptions as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Network error')
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  await expect(response.json()).resolves.toEqual({
    name: 'Error',
    message: 'Network error',
    stack: expect.any(String),
  })
})

it('treats a thrown Response as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('hello world')
})

it('treats a Response.error() as a network error', async ({ task }) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<TypeError & { cause?: unknown }>((error) => error)

  expect(requestError.name).toBe('TypeError')

  if (task.file.projectName === 'browser') {
    expect(requestError.message).toBe('Failed to fetch')
    expect(requestError.cause).toBeInstanceOf(Response)
  } else {
    expect(requestError.message).toBe('fetch failed')
    expect(requestError.cause).toEqual(new TypeError('Network error'))
  }
})

it('treats a thrown Response.error() as a network error', async ({ task }) => {
  interceptor.on('request', () => {
    throw Response.error()
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<TypeError & { cause?: unknown }>((error) => error)

  expect(requestError.name).toBe('TypeError')

  if (task.file.projectName === 'browser') {
    expect(requestError.message).toBe('Failed to fetch')
    expect(requestError.cause).toBeInstanceOf(Response)
  } else {
    expect(requestError.message).toBe('fetch failed')
    expect(requestError.cause).toEqual(new TypeError('Network error'))
  }
})

it('handles exceptions by default if "unhandledException" is provided but does nothing', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', unhandledExceptionListener)

  const response = await fetch('http://localhost/resource')

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  await expect(response.json()).resolves.toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()
})

it('handles exceptions as instructed in "unhandledException" listener (mock response)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    const { controller } = args
    unhandledExceptionListener(args)

    // Handle exceptions as a fallback 200 OK response.
    controller.respondWith(new Response('fallback response'))
  })

  const response = await fetch('http://localhost/resource')

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('fallback response')

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
})

it('handles exceptions as instructed in "unhandledException" listener (request error)', async ({
  task,
}) => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    const { controller } = args
    unhandledExceptionListener(args)

    // Handle exceptions as a request error.
    controller.errorWith(new Error('Fallback error'))
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<Error & { cause?: unknown }>((error) => error)

  if (task.file.projectName === 'browser') {
    expect(requestError.name).toBe('Error')
    expect(requestError.message).toBe('Fallback error')
    expect(requestError.cause).toBeUndefined()
  } else {
    /**
     * @note In Node.js, custom request errors surface as the cause
     * of the fetch rejection because they destroy the underlying socket.
     */
    expect(requestError.name).toBe('TypeError')
    expect(requestError.message).toBe('fetch failed')
    expect(requestError.cause).toEqual(new Error('Fallback error'))
  }

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
})
