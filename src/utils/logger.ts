import debug from 'debug'

export type LogLevel = 'default' | 'verbose'

export interface Logger {
  info(message: string, ...positionals: Array<unknown>): void
  verbose(message: string, ...positionals: Array<unknown>): void
  isEnabled(level: LogLevel): boolean
}

const LOG_TIMESTAMP_REGEXP = /\d{2}:\d{2}:\d{2}\.\d{3}/

function normalizeNamespace(namespace: string): string {
  return namespace
    .split(':')
    .map((segment) => {
      return segment
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
    })
    .filter(Boolean)
    .join(':')
}

function getTimestamp(): string {
  return new Date().toISOString().slice(11, 23)
}

async function readBody(message: Request | Response): Promise<string | null> {
  if (message.body == null) {
    return null
  }

  try {
    return await message.clone().text()
  } catch {
    return null
  }
}

function formatHeaders(headers: Headers): Array<string> {
  return Array.from(headers.entries()).map(([name, value]) => {
    return `${name}: ${value}`
  })
}

async function formatHttpMessage(
  startLine: string,
  message: Request | Response
): Promise<string> {
  const lines = [startLine, ...formatHeaders(message.headers)]
  const body = await readBody(message)

  lines.push('', body ?? '')

  return lines.join('\n')
}

export async function formatRequest(request: Request): Promise<string> {
  return formatHttpMessage(`${request.method} ${request.url}`, request)
}

export async function formatResponse(response: Response): Promise<string> {
  const statusText = response.statusText ? ` ${response.statusText}` : ''
  return formatHttpMessage(
    `HTTP ${response.status}${statusText}`,
    response
  )
}

function formatLogArguments(arguments_: Array<unknown>): void {
  const message = arguments_[0]

  if (typeof message === 'string') {
    const messageWithoutDebugTimestamp = message.replace(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /,
      ''
    )
    const timestampMatch = messageWithoutDebugTimestamp.match(
      LOG_TIMESTAMP_REGEXP
    )

    if (!timestampMatch || timestampMatch.index === undefined) {
      arguments_[0] = messageWithoutDebugTimestamp
      return
    }

    const messagePrefix = messageWithoutDebugTimestamp
      .slice(0, timestampMatch.index)
      .trim()
    const messageBody = messageWithoutDebugTimestamp
      .slice(timestampMatch.index + timestampMatch[0].length)
      .trimStart()

    arguments_[0] = `${timestampMatch[0]} ${messagePrefix} ${messageBody}`
  }
}

function useConciseTimestamp(logger: debug.Debugger): void {
  logger.log = (...arguments_) => {
    formatLogArguments(arguments_)
    debug.log(...arguments_)
  }
}

function isVerboseLoggingEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env.DEBUG_LEVEL === 'verbose') {
    return true
  }

  try {
    return globalThis.localStorage?.getItem('debugLevel') === 'verbose'
  } catch {
    return false
  }
}

export function createLogger(namespace: string): Logger {
  const normalizedNamespace = normalizeNamespace(namespace)
  const logger = debug(`interceptors:${normalizedNamespace}`)
  Reflect.set(logger, 'useColors', true)
  useConciseTimestamp(logger)

  return {
    info(message, ...positionals) {
      logger(`${getTimestamp()} ${message}`, ...positionals)
    },
    verbose(message, ...positionals) {
      if (!isVerboseLoggingEnabled()) {
        return
      }

      logger(`${getTimestamp()} ${message}`, ...positionals)
    },
    isEnabled(level) {
      return (
        logger.enabled && (level === 'default' || isVerboseLoggingEnabled())
      )
    },
  }
}
