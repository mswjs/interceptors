import { EventOverride } from './EventOverride'

export class ProgressEventPolyfill extends EventOverride {
  readonly lengthComputable: boolean
  readonly composed: boolean
  readonly loaded: number
  readonly total: number

  constructor(type: string, init?: ProgressEventInit) {
    super(type)

    this.lengthComputable = init?.lengthComputable || false
    this.composed = init?.composed || false
    this.loaded = init?.loaded || 0
    this.total = init?.total || 0
  }
}
