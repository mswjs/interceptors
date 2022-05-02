import { EventPolyfill } from '../interceptors/XMLHttpRequest/polyfills/EventPolyfill'

export interface MessageEventPolyfillInit<DataType extends any> {
  data?: DataType | null
  target?: EventTarget
}

export class MessageEventPolyfill<DataType extends any> extends EventPolyfill {
  public data: any | null
  public origin: string
  public lastEventId: string
  public ports: ReadonlyArray<MessagePort>
  public source: MessageEventSource | null

  constructor(type: string, init?: MessageEventPolyfillInit<DataType>) {
    super(type, {
      target: init?.target || null,
      currentTarget: init?.target || null,
    })

    this.data = init?.data || null
    this.origin = ''
    this.lastEventId = ''
    this.ports = []
    this.source = null
  }
}
