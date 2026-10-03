// @vitest-environment node
import * as grpc from '@grpc/grpc-js'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'

interface HelloRequest {
  name: string
}

interface HelloReply {
  message: string
}

const greeterService = {
  sayHello: {
    path: '/greeter.Greeter/SayHello',
    requestStream: false,
    responseStream: false,
    requestSerialize(request: HelloRequest) {
      return Buffer.from(JSON.stringify(request))
    },
    requestDeserialize(buffer: Buffer): HelloRequest {
      return JSON.parse(buffer.toString())
    },
    responseSerialize(reply: HelloReply) {
      return Buffer.from(JSON.stringify(reply))
    },
    responseDeserialize(buffer: Buffer): HelloReply {
      return JSON.parse(buffer.toString())
    },
  },
} satisfies grpc.ServiceDefinition

const sayHello: grpc.handleUnaryCall<HelloRequest, HelloReply> = (
  call,
  callback
) => {
  callback(null, { message: `Hello, ${call.request.name}!` })
}

const GreeterClient = grpc.makeGenericClientConstructor(
  greeterService,
  'Greeter'
)

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('performs a call as-is', async () => {
  const server = new grpc.Server()
  onTestFinished(() => {
    server.forceShutdown()
  })
  server.addService(greeterService, { sayHello })

  const pendingPort = Promise.withResolvers<number>()
  server.bindAsync(
    '127.0.0.1:0',
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        pendingPort.reject(error)
        return
      }

      pendingPort.resolve(port)
    }
  )
  const port = await pendingPort.promise

  const client = new GreeterClient(
    `127.0.0.1:${port}`,
    grpc.credentials.createInsecure()
  )
  onTestFinished(() => {
    client.close()
  })

  const pendingReply = Promise.withResolvers<HelloReply>()
  client.sayHello(
    { name: 'John' },
    (error: grpc.ServiceError | null, reply: HelloReply) => {
      if (error) {
        pendingReply.reject(error)
        return
      }

      pendingReply.resolve(reply)
    }
  )

  await expect(pendingReply.promise).resolves.toEqual({
    message: 'Hello, John!',
  })
})

it('responds to a call with a mocked status', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: {
          'content-type': 'application/grpc',
          'grpc-status': grpc.status.NOT_FOUND.toString(),
          'grpc-message': 'User not found',
        },
      })
    )
  })

  const client = new GreeterClient(
    '127.0.0.1:50051',
    grpc.credentials.createInsecure()
  )
  onTestFinished(() => {
    client.close()
  })

  const pendingReply = Promise.withResolvers<HelloReply>()
  client.sayHello(
    { name: 'John' },
    (error: grpc.ServiceError | null, reply: HelloReply) => {
      if (error) {
        pendingReply.reject(error)
        return
      }

      pendingReply.resolve(reply)
    }
  )

  await expect(pendingReply.promise).rejects.toMatchObject({
    code: grpc.status.NOT_FOUND,
    details: 'User not found',
  })
})

it('observes a call performed as-is', async () => {
  const server = new grpc.Server()
  onTestFinished(() => {
    server.forceShutdown()
  })
  server.addService(greeterService, { sayHello })

  const pendingPort = Promise.withResolvers<number>()
  server.bindAsync(
    '127.0.0.1:0',
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        pendingPort.reject(error)
        return
      }

      pendingPort.resolve(port)
    }
  )
  const port = await pendingPort.promise

  const requestListener =
    vi.fn<(method: string, url: string, message: HelloRequest) => void>()
  const responseListener =
    vi.fn<(responseType: string, status: number) => void>()

  interceptor.on('request', async ({ request }) => {
    // A gRPC message follows a 5-byte prefix (compression flag and length).
    const requestBody = Buffer.from(await request.clone().arrayBuffer())
    requestListener(
      request.method,
      request.url,
      JSON.parse(requestBody.subarray(5).toString())
    )
  })
  interceptor.on('response', ({ response, responseType }) => {
    responseListener(responseType, response.status)
  })

  const client = new GreeterClient(
    `127.0.0.1:${port}`,
    grpc.credentials.createInsecure()
  )
  onTestFinished(() => {
    client.close()
  })

  const pendingReply = Promise.withResolvers<HelloReply>()
  client.sayHello(
    { name: 'John' },
    (error: grpc.ServiceError | null, reply: HelloReply) => {
      if (error) {
        pendingReply.reject(error)
        return
      }

      pendingReply.resolve(reply)
    }
  )

  await expect(pendingReply.promise).resolves.toEqual({
    message: 'Hello, John!',
  })
  expect(requestListener).toHaveBeenCalledExactlyOnceWith(
    'POST',
    `http://127.0.0.1:${port}/greeter.Greeter/SayHello`,
    { name: 'John' }
  )
  expect(responseListener).toHaveBeenCalledExactlyOnceWith('original', 200)
})
