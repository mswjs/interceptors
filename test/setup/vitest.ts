import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    server: {
      http: string
      https: string
    }
  }
}

export function getTestServer() {
  const server = inject('server')

  const createUrlBuilder = (protocol: 'http' | 'https') => {
    return (path = '/'): URL => {
      return new URL(path, server[protocol])
    }
  }

  return {
    http: {
      href: server.http,
      url: createUrlBuilder('http'),
    },
    https: {
      href: server.https,
      url: createUrlBuilder('https'),
    },
  }
}
