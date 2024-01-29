type EventWithTarget<E extends Event, T> = E & { target: T }

export function bindEvent<E extends Event, T>(
  target: T,
  event: E
): EventWithTarget<E, T> {
  Object.defineProperty(event, 'target', {
    enumerable: true,
    writable: false,
    value: target,
  })
  return event as EventWithTarget<E, T>
}
