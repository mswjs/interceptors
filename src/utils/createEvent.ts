export function createEvent<EventType extends Event, EventInit extends Object>(
  EventConstructor: { new (type: string, init?: EventInit): EventType },
  eventName: string,
  options?: EventInit & { target?: EventTarget }
) {
  const event = new EventConstructor(eventName, options)

  if (options?.target) {
    Object.defineProperty(event, 'target', {
      value: options.target,
      enumerable: true,
      writable: false,
    })
  }

  return event
}
