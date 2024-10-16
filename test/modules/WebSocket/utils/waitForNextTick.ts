export async function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve())
  })
}
