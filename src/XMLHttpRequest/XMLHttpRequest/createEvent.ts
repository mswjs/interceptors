import { EventOverride } from './EventOverride'

export function createEvent(options: any, target: any, type: string) {
  const progressEvents = [
    'error',
    'progress',
    'loadstart',
    'loadend',
    'load',
    'timeout',
    'abort',
  ]

  const event = progressEvents.includes(type)
    ? new ProgressEvent(type, {
        lengthComputable: true,
        loaded: options?.loaded || 0,
        total: options?.total || 0,
      })
    : new EventOverride(type, {
        target,
        currentTarget: target,
      })

  return event
}
