import { DeferredPromise } from '@open-draft/deferred-promise'
import { InterceptorError } from '@mswjs/interceptors'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to a request via "respondWith"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mock'))
  })

  const response = await fetch('http://localhost/resource')
  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')
})

it('throws if "respondWith" is called multiple times within the same listener', async () => {
  const errorPromise = new DeferredPromise<unknown>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mock'))

    try {
      controller.respondWith(new Response('no-op'))
    } catch (error) {
      errorPromise.resolve(error)
    }
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const response = await fetch('http://localhost/resource')

  // Must not treat multiple "respondWith" calls error as an exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must throw an error for the developer.
  const error = await errorPromise
  expect(error).toBeInstanceOf(InterceptorError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'InterceptorError')
  expect(error).toHaveProperty(
    'message',
    `Failed to respond to the "GET http://localhost/resource" request with "200 OK": the request has already been handled (2)`
  )

  // Must respond to the request using the first mocked response.
  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')
})

it('throws if "respondWith" is called multiple times across different listeners', async () => {
  const errorPromise = new DeferredPromise<unknown>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mock'))
  })
  interceptor.on('request', ({ controller }) => {
    try {
      controller.respondWith(new Response('no-op'))
    } catch (error) {
      errorPromise.resolve(error)
    }
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const response = await fetch('http://localhost/resource')

  // Must not treat multiple "respondWith" calls error as an exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must throw an error for the developer.
  const error = await errorPromise
  expect(error).toBeInstanceOf(InterceptorError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'InterceptorError')
  expect(error).toHaveProperty(
    'message',
    `Failed to respond to the "GET http://localhost/resource" request with "200 OK": the request has already been handled (2)`
  )

  // Must respond to the request using the first mocked response.
  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')
})

it('errors the request via "errorWith"', async ({ task }) => {
  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('Oops!'))
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const requestError = await fetch('http://localhost/resource').then<
    null,
    Error & { cause?: unknown }
  >(
    () => null,
    (error) => error
  )

  // Must not treat request errors as an unhandled exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must reject the response promise with the given error.
  expect(requestError).toBeInstanceOf(Error)

  if (task.file.projectName === 'browser') {
    expect(requestError).toHaveProperty('name', 'Error')
    expect(requestError).toHaveProperty('message', 'Oops!')
  } else {
    /**
     * @note In Node.js, custom request errors surface as the cause
     * of the fetch rejection because they destroy the underlying socket.
     */
    expect(requestError).toHaveProperty('name', 'TypeError')
    expect(requestError).toHaveProperty('message', 'fetch failed')
    expect(requestError?.cause).toEqual(new Error('Oops!'))
  }
})

it('throws if "errorWith" is called multiple times within the same listener', async ({
  task,
}) => {
  const errorPromise = new DeferredPromise<unknown>()

  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('one'))

    try {
      controller.errorWith(new Error('two'))
    } catch (error) {
      errorPromise.resolve(error)
    }
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const requestError = await fetch('http://localhost/resource').then<
    null,
    Error & { cause?: unknown }
  >(
    () => null,
    (error) => error
  )

  // Must not treat multiple "respondWith" calls error as an exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must throw an error for the developer.
  const error = await errorPromise
  expect(error).toBeInstanceOf(InterceptorError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'InterceptorError')
  expect(error).toHaveProperty(
    'message',
    `Failed to error the "GET http://localhost/resource" request with "Error: two": the request has already been handled (3)`
  )

  // Must reject the response promise with the first given error.
  expect(requestError).toBeInstanceOf(Error)

  if (task.file.projectName === 'browser') {
    expect(requestError).toHaveProperty('name', 'Error')
    expect(requestError).toHaveProperty('message', 'one')
  } else {
    expect(requestError).toHaveProperty('name', 'TypeError')
    expect(requestError).toHaveProperty('message', 'fetch failed')
    expect(requestError?.cause).toEqual(new Error('one'))
  }
})

it('throws if "errorWith" is called multiple times across different listeners', async ({
  task,
}) => {
  const errorPromise = new DeferredPromise<unknown>()

  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('one'))
  })
  interceptor.on('request', ({ controller }) => {
    try {
      controller.errorWith(new Error('two'))
    } catch (error) {
      errorPromise.resolve(error)
    }
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const requestError = await fetch('http://localhost/resource').then<
    null,
    Error & { cause?: unknown }
  >(
    () => null,
    (error) => error
  )

  // Must not treat multiple "respondWith" calls error as an exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must throw an error for the developer.
  const error = await errorPromise
  expect(error).toBeInstanceOf(InterceptorError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'InterceptorError')
  expect(error).toHaveProperty(
    'message',
    `Failed to error the "GET http://localhost/resource" request with "Error: two": the request has already been handled (3)`
  )

  // Must reject the response promise with the first given error.
  expect(requestError).toBeInstanceOf(Error)

  if (task.file.projectName === 'browser') {
    expect(requestError).toHaveProperty('name', 'Error')
    expect(requestError).toHaveProperty('message', 'one')
  } else {
    expect(requestError).toHaveProperty('name', 'TypeError')
    expect(requestError).toHaveProperty('message', 'fetch failed')
    expect(requestError?.cause).toEqual(new Error('one'))
  }
})

it('throws if "respondWith" is called after "errorWith" was called', async ({
  task,
}) => {
  const errorPromise = new DeferredPromise<unknown>()

  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('one'))
    try {
      controller.respondWith(new Response('mock'))
    } catch (error) {
      errorPromise.resolve(error)
    }
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const requestError = await fetch('http://localhost/resource').then<
    null,
    Error & { cause?: unknown }
  >(
    () => null,
    (error) => error
  )

  // Must not treat multiple "respondWith" calls error as an exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must throw an error for the developer.
  const error = await errorPromise
  expect(error).toBeInstanceOf(InterceptorError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'InterceptorError')
  expect(error).toHaveProperty(
    'message',
    `Failed to respond to the "GET http://localhost/resource" request with "200 OK": the request has already been handled (3)`
  )

  // Must reject the response promise with the given error.
  expect(requestError).toBeInstanceOf(Error)

  if (task.file.projectName === 'browser') {
    expect(requestError).toHaveProperty('name', 'Error')
    expect(requestError).toHaveProperty('message', 'one')
  } else {
    expect(requestError).toHaveProperty('name', 'TypeError')
    expect(requestError).toHaveProperty('message', 'fetch failed')
    expect(requestError?.cause).toEqual(new Error('one'))
  }
})

it('throws if "errorWith" is called after "respondWith" was called', async () => {
  const errorPromise = new DeferredPromise<unknown>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mock'))
    try {
      controller.errorWith(new Error('one'))
    } catch (error) {
      errorPromise.resolve(error)
    }
  })

  const unhandledExceptionListener = vi.fn()
  interceptor.on('unhandledException', unhandledExceptionListener)

  const response = await fetch('http://localhost/resource')

  // Must not treat multiple "respondWith" calls error as an exception.
  expect(unhandledExceptionListener).not.toHaveBeenCalled()

  // Must throw an error for the developer.
  const error = await errorPromise
  expect(error).toBeInstanceOf(InterceptorError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'InterceptorError')
  expect(error).toHaveProperty(
    'message',
    `Failed to error the "GET http://localhost/resource" request with "Error: one": the request has already been handled (2)`
  )

  // Must resolve the response promise with the given mocked response.
  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('mock')
})
