type EventWithTarget<E extends Event, T> = E & { target: T }

export function bindEvent<E extends Event, T>(
  target: T,
  event: E
): EventWithTarget<E, T> {
  Reflect.set(event, 'target', target)
  return event as EventWithTarget<E, T>
}
