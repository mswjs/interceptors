export function nextTickAsync(callback: () => void) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(callback())
    }, 0)
  })
}
