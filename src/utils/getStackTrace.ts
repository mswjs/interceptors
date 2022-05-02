export function getStackTrace(): string {
  const trace = new Error().stack

  if (!trace) {
    return ''
  }

  const formatted = trace.split('\n').slice(2).join('\n')

  return `\n${formatted}\n`
}
