interface InternalConnectionContext {
  run<T>(callback: () => T): T
  consume(): boolean
}

declare global {
  var __MSW_INTERNAL_CONNECTION_CONTEXT: InternalConnectionContext | undefined
}

/**
 * Share the Node-provided async context with the browser-built WebSocket
 * entry point without importing Node modules into the browser bundle.
 */
export function runAsInternalConnection<T>(callback: () => T): T {
  const context = globalThis.__MSW_INTERNAL_CONNECTION_CONTEXT

  if (context) {
    return context.run(callback)
  }

  return callback()
}
