export function baseUrlFromConnectionOptions(options: any): URL {
  // Handle Unix socket paths
  if (options.socketPath) {
    // Create a special URL that won't trigger TCP connections
    const protocol = options.port === 443 ? 'https:' : 'http:'
    const url = new URL(`${protocol}//unix-socket-placeholder`)

    if (options.path) {
      url.pathname = options.path
    }

    return url
  }

  if ('href' in options) {
    return new URL(options.href)
  }

  const protocol = options.port === 443 ? 'https:' : 'http:'
  const host = options.host

  const url = new URL(`${protocol}//${host}`)

  if (options.port) {
    url.port = options.port.toString()
  }

  if (options.path) {
    url.pathname = options.path
  }

  if (options.auth) {
    const [username, password] = options.auth.split(':')
    url.username = username
    url.password = password
  }

  return url
}
