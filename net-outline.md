## High-level architecture overview

> The `net.Socket` constructor doesn't have all the context of `net.connect()` to be a viable layer of interception. All the network requests in Node.js go through `net.connect()` (HTTP, SMTP, etc).

```
http.request
  Agent.createConnection()
      net.Socket
```

```
net.connect()
  net.Socket
```

## Pieces

- `SocketInterceptor`. A regular interceptor, patches `net.connect()` and emits the "connection" event to the consumers.
- `MockSocket` returned from the patched `net.connect()`. Always emulates a successful connection, allows spying on the data sent by the client (`socket.write()`) and pushing data to it from the interceptor.
- `SocketController` that, similar to `RequestController`, lets the user decide what to do with the intercepted socket connection. Unlike requests, there's no single `respondWith()` as the nature of data sent via the socket is ambiguous and is for the higher-level interceptors to determine and appropriately handle. There are still, however, methods to error the intercepted connection (`SocketController.errorWith()`) and perform it as-is (`SocketController.passthrough()`).
- A special `net.Socket` representation exposed in the "connection" listener. The `MockSocket` placeholder is _client-side_. To work with the intercepted socket from the server's perspective in the "connection" listener, another, special socket instance has to be provided. It acts as a mirror and allows the user to write data _to_ the client socket via `socket.write()` and listen to the data _sent_ from the client via `socket.on('data')`. This won't be possible with the client placeholder as `socket.on('data')` would represent the data received from the _server_ (and must still be emitted when the interceptor sends mock data to the socket).

This pretty much covers the mock-first scenarios. But when it comes to passthrough, it gets tricky. The passthrough socket will usually be created after some time the connection has been intercepted. During that time, the intercepted socket might have been acted upon (e.g. written to, changed via methods). The passthrough socket would have to be put _in the exact same state_ as the intercepted socket at the moment of calling `SocketController.passthrough()`.

This is where I think about employing an _object recorder_. It will use `Proxy` to record any changes done with the intercepted socket instance and then allow us to replay those changes on the passthrough socket.

## Problems

### Problem 1: Passthrough socket state

Node.js sockets are quite intricate. Even with deduped method/property recording via `AsyncLocalStorage`, it still arrives at the state where a change on the intercepted socket is attempted to be recorded when the recorder should've stopped altogether after `passthrough()`.

### Problem 2: The placeholder `MockSocket`

Even when the passthrough connection is established, the consumers, like `http.Agent`, have already received and stored the placeholder `MockSocket` as their socket. This means that for passthrough scenarios, the `MockSocket` instance would have to become a _proxy socket_, forwarding whatever data or changes from the passthrough socket.

What makes it more complex is that the consumers might still _act_ on the placeholder socket even after passthrough. Those acts would also have to be forwarded to the passthrough socket. It seems that the object recorder over the placeholder socket mustn't stop after passthrough, after all. Instead, it should replay the actions on the passthrough socket immediately if passthrough has been established.

```ts
this.#recorder = new ObjectRecorder(socket, {
  filter(entry) {
    if (this.#passthroughSocket) {
      entry.replay(this.#passthroughSocket)
      return false
    }
  }
})

// ...later on.
public passthrough(): net.Socket {
  this.#passthroughSocket = this.options.createConnection()
  this.#recorder.pause()
  this.#recorder.replay(this.#passthroughSocket)
  this.#recorder.resume()
}
```

> Above, I'm using the `filter()` capabilities of the object recorder to immediately replay the recorded action on the passthrough socket, if it exists.

Considering that the recorder should continue recording and replaying events, it looks like I need to implement some sort of _entry buffering_. While the previously recorded changes are being replayed on the passthrough socket, the consumers might produce _new changes_ to the placeholder socket. With the approach above, those changes will be lost. So the recorder have to be put in a buffering state until the replay is done, and then replay any buffered events immediately after that.

> Note: I would love to forego the object recording altogether in favor of something more elegant. I just don't know what that something might be. The actual connection cannot be established as it would error.

## Alternative to object recording

Alternatively, instead of having two separate sockets (placeholder and passthrough), only a _single_ passthrough socket can be used. With this approach, all that I have to do is this:

- Record and silence any errors occurring on the socket. Those are crucial to be replayed if the user decides to passthrough.
- Buffer the data sent from the client instead of sending it to the server. Any writes are still translated to the special `socket` for the "connection" listener.

Then, if passthrough is established, the socket would have to:

- Replay the errors, if any. This is for passing through to non-existing hosts.
- If no errors were emitted, replay all the writes that occurred so the original socket will receive them.

> The danger here are the write callbacks: `socket.write(chunk, encoding, callback)`. Those callbacks would have to be called for the mock-first scenario as consumer logic can and will depend on those callbacks. But calling them _again_ in passthrough will be a mistake.
