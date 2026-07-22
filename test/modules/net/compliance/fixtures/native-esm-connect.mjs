/**
 * @note This fixture MUST be loaded via a native dynamic import
 * (not transformed by the test runner). It snapshots the "node:net"
 * and "node:tls" module bindings at link time, the same way any
 * native ESM consumer does. Interception must keep working for
 * these snapshot bindings (e.g. "https-proxy-agent" v9+).
 */
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

export function connectTcp(port, host) {
  return netConnect(port, host)
}

export function connectTls(options) {
  return tlsConnect(options)
}
