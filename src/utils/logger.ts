import debug from 'debug'

export function createLogger(namespace: string) {
  return debug(`interceptors:${namespace}`)
}
