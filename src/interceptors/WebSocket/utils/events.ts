interface CloseEventInit extends EventInit {
  code?: number
  reason?: string
  wasClean?: boolean
}

export class CloseEvent extends Event {
  public code: number
  public reason: string
  public wasClean: boolean

  constructor(type: string, init: CloseEventInit = {}) {
    super(type, init)
    this.code = init.code === undefined ? 0 : init.code
    this.reason = init.reason === undefined ? '' : init.reason
    this.wasClean = init.wasClean === undefined ? false : init.wasClean
  }
}
