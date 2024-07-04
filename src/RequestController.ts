export interface RequestControllerInit {
  respondWith: (response: Response) => void
  errorWith: (error?: Error) => void
}

export class RequestController {
  public respondWith: RequestControllerInit['respondWith']
  public errorWith: RequestControllerInit['errorWith']

  constructor(init: RequestControllerInit) {
    this.respondWith = init.respondWith
    this.errorWith = init.errorWith
  }
}
