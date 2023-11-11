export function extendEvent(
  event: Event,
  properties: Record<string, unknown>
): void {
  for (const name in properties) {
    Reflect.set(event, name, properties[name])
  }
}
