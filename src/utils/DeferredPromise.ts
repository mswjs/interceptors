export class DeferredPromise<T extends unknown> {
  public promise: Promise<T>
  public resolve: (data: T) => void
  public reject: (reason?: unknown) => void

  constructor() {
    this.resolve = noop
    this.reject = noop

    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

function noop() {
  throw new Error(
    'Failed to call DeferredPromise callback: underlying Promise is not created'
  )
}
