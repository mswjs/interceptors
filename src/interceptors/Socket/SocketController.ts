import net from 'net'
import { normalizeClientRequestWriteArgs } from '../ClientRequest/utils/normalizeClientRequestWriteArgs'

export class SocketController {
  constructor(
    protected socket: net.Socket,
    protected connectionOptions?: net.NetConnectOpts
  ) {
    //
    console.log('controller', typeof socket)
  }
}

export class SocketOverride extends net.Socket {
  constructor(url: URL) {
    super()
    console.log('new SocketOverride()', url)

    this.connect({
      protocol: url.protocol,
      host: url.host,
      port: url.port,
      path: url.pathname,
    })

    this.on('finish', () => console.log('finish'))
  }

  public connect(...args: any[]) {
    console.log('SocketOverride.connect()', args)

    Reflect.set(this, 'connecting', true)

    this.emit('lookup', null, '0.0.0.0', 'addressType', 'host')
    this.emit('connect', false)

    Reflect.set(this, 'connecting', false)

    this._handle = {
      readStart() {},
      writeLatin1String: (x) => 0,
      close() {},
    }

    return this
  }

  public write(...args: any[]) {
    const [chunk, data, callback] = normalizeClientRequestWriteArgs(args)
    console.log('SocketOverride.write()', chunk)

    return super.write(...args)
  }
}
