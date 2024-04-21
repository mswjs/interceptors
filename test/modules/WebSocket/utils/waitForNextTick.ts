export async function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve())
  })
}
