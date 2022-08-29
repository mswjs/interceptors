import {
  HttpServer as OrigHttpServer,
  httpsAgent,
} from '@open-draft/test-server/http'

export const HttpServer = OrigHttpServer

const PATCHED_IPV6: unique symbol = Symbol('isPatchedIPv6Compat')

type PatchedForIPv6Compat<Method> = Method & {
  [PATCHED_IPV6]?: true
}

type PatchedGetServerAddress = PatchedForIPv6Compat<
  typeof OrigHttpServer.getServerAddress
>
type PatchedBuildHttpServerApi = PatchedForIPv6Compat<
  typeof OrigHttpServer.prototype['buildHttpServerApi']
>

/**
 * Patch `HttpServer` from `@open-draft/test-server/http`, to fix bug in URL
 * serialization of IPv6 addresses, by surrounding the host with brackets, e.g.:
 *
 *      correct:  { port: 37007, host: '::1', url: 'http://[::1]:37007' }
 *    incorrect:  { port: 37007, host: '::1', url: 'http://::1:37007' }
 *                                                        ^^^^^ missing [ ]
 *
 * This bug appears in Node v18 due to new behavior of inheriting operating system
 * DNS resolution order, so some dual-stack hosts will resolve addresses including
 * `localhost` to `::1`, causing `HttpServer` to bind to `::1` instead of `127.0.0.1`.
 *
 * This patch is a work-around until the upstream bug is fixed in the
 * `@open-draft/test-server` package.
 *
 * To use this patch, change every import of `HttpServer` and `httpsAgent` to
 * import from this file, instead of upstream `@open-draft/test-server/http`
 *
 * To deprecate this patch once the upstream bug is fixed, revert all the
 * imports to use `@open-draft/test-server/http`, and delete this file.
 */
const applyPatchFixingIPv6URISerialization = (
  HttpServer: typeof OrigHttpServer
): void => {
  if ((HttpServer.getServerAddress as PatchedGetServerAddress)[PATCHED_IPV6]) {
    console.log('DUPLICATE PATCH: HttpServer.getServerAddress')
  }

  var origGetServerAddress = HttpServer.getServerAddress
  /**
   * Patch `static HttpServer.getServer` to fix URI serialization of IPv6 hosts,
   * by calling the original method and then modifying the return value.
   *
   * @see HttpServer.getServerAddress
   */
  HttpServer.getServerAddress = function () {
    const address = origGetServerAddress.apply(
      {}, // we're patching a static method so we expect no valid `this` binding
      arguments as unknown as Parameters<typeof HttpServer.getServerAddress>
    )

    // Copy the same behavior of the original function, but fix the ternary
    Object.defineProperty(address, 'href', {
      get() {
        // assume: host with `:` is definitely not valid IPv4, likely valid IPv6
        return new URL(
          `${this.protocol}//${
            this.host.includes(':') &&
            !this.host.startsWith('[') &&
            !this.host.endsWith(']')
              ? `[${this.host}]`
              : this.host
          }:${this.port}`
        ).href
      },
      enumerable: true,
    })

    return address
  } as PatchedGetServerAddress
  ;(HttpServer.getServerAddress as PatchedGetServerAddress)[PATCHED_IPV6] = true

  if (
    // @ts-ignore accessing private method .buildHttpServerApi
    HttpServer.prototype.buildHttpServerApi[PATCHED_IPV6]
  ) {
    console.log('DUPLICATE PATCH: HttpServer.prototype.buildHttpServerApi')
  }

  /**
   * Patch `HttpServer.buildHttpServerApi` (private) class method, to fix
   * URI serialization of IPv6 hosts.
   *
   * This patch re-implements the original behavior of the function, but it's necessary
   * so that `buildHttpServerApi` can call the newly patched `HttpServer.getServerAddress`
   */
  // @ts-ignore patching a private method
  HttpServer.prototype.buildHttpServerApi = ((
    server: Parameters<typeof HttpServer.getServerAddress>[0]
  ) => {
    const address = HttpServer.getServerAddress(server)

    return {
      address,
      url(path = '/') {
        return new URL(path, address.href).href
      },
    }
  }) as PatchedBuildHttpServerApi
  HttpServer.prototype['buildHttpServerApi'][PATCHED_IPV6] = true
}

applyPatchFixingIPv6URISerialization(HttpServer)

export { httpsAgent }
