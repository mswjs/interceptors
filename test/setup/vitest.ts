import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    server: {
      http: string
      https: string
      ws: string
      io: string
    }
    /**
     * The major version of the Node.js process running the tests.
     * Undefined in the browser, failing any version checks so
     * version-gated assertions never apply there.
     */
    nodeMajorVersion: number
  }
}

export function getTestServer() {
  const server = inject('server')

  const createUrlBuilder = (protocol: 'http' | 'https' | 'ws' | 'io') => {
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
    ws: {
      href: server.ws,
      url: createUrlBuilder('ws'),
    },
    io: {
      href: server.io,
      url: createUrlBuilder('io'),
    },
  }
}
