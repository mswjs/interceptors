import * as http from 'http'
import { DeferredPromise } from '../../../utils/DeferredPromise'

export class RequestBodyReader {
  private readPromise: DeferredPromise<Buffer>
  private requestBody: Buffer[]
  private pureWrite: typeof http.ClientRequest.prototype.write
  private pureEnd: typeof http.ClientRequest.prototype.end

  constructor(private readonly request: http.ClientRequest) {
    this.readPromise = new DeferredPromise()
    this.requestBody = []
    this.pureWrite = request.write
    this.pureEnd = request.end

    this.readStart()
  }

  get done() {
    return this.readPromise.promise
  }

  private readStart(): void {
    const self = this

    // Read the request body by proxying the "write"/"end" methods
    // because reading it in "serverSide.on('data')" is too low-level
    // and requires you to parse the raw HTTP request message which is
    // a bad idea to do without a designated parser.
    this.request.write = new Proxy(this.request.write, {
      apply(target, thisArg, args) {
        const [chunk, encoding] = args

        self.requestBody.push(Buffer.from(chunk, encoding))

        return Reflect.apply(target, thisArg, args)
      },
    })

    this.request.end = new Proxy(this.request.end, {
      apply(target, thisArg, args) {
        const [chunk] = args

        if (chunk != null) {
          self.requestBody.push(Buffer.from(chunk))
        }

        self.readStop()

        return Reflect.apply(target, thisArg, args)
      },
    })
  }

  private readStop(): void {
    this.readPromise.resolve(Buffer.concat(this.requestBody))
    this.request.write = this.pureWrite
    this.request.end = this.pureEnd
  }
}
