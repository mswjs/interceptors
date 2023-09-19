import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'

export class RequestController {
  public responsePromise: DeferredPromise<Response | undefined>

  constructor(protected request: Request) {
    this.responsePromise = new DeferredPromise()
  }

  public respondWith(response: Response): void {
    invariant(
      this.responsePromise.state === 'pending',
      'Failed to call "respondWith()" for "%s %s": request already handled',
      this.request.method,
      this.request.url
    )

    this.responsePromise.resolve(response)
  }
}
