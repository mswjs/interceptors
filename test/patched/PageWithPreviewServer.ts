/**
 * Patch the `server` variable from `page-with/server`, which is a mutable
 * variable that is updated during execution of `createBrowser` to contain
 * the connection info of the preview server which was created for the page.
 *
 * This function needs to be called from a scope where that mutable variable
 * is available. That's why we call it in `jest.browser.setup.ts`.
 *
 * When the upstream bug is fixed, remove this file and remove the code that
 * calls it in `jest.browser.setup.ts`
 *
 */
export const patchServerConnectionInfo = (server: PreviewServer) => {
  // bug: `PreviewServer.listen()` serializes IPv6 hosts to invalid URL (missing square brackets)
  // see: node_modules/page-with/lib/server/PreviewServer.js / PreviewServer.listen
  const conn = server.connectionInfo

  // fix: re-serialize any URL containing an IPv6 host without surrounding brackets
  if (conn.host.includes(':') && !conn.url.includes(`[${conn.host}]`)) {
    // note: scheme is hardcoded to `http` to match `PreviewServer.listen()`
    server!.connectionInfo!.url = `http://[${conn.host}]:${conn.port}`
  }
}

/**
 * This is the same as the upstream type (but non-nullable), but we don't import
 * from `page-with` because we we want to access its mutable `server` export,
 * which gets messy if we import from thw file twice (could access wrong closure)
 */
type PreviewServer = {
  connectionInfo: {
    port: number
    host: string
    url: string
  }
}
