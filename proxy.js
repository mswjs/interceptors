const http = require('node:http')
const net = require('node:net')
const { URL } = require('node:url')

// Create an HTTP tunneling proxy
const proxy = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('okay')
})
proxy.on('connect', (req, clientSocket, head) => {
  console.log('\n\nproxy.on(connect)', req.method, req.url, {
    clientSocket,
    head: head.toString('utf8'),
  })

  // Connect to an origin server
  const { port, hostname } = new URL(`http://${req.url}`)
  const serverSocket = net.connect(port || 80, hostname, () => {
    clientSocket.write(
      'HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-agent: Node.js-Proxy\r\n' +
        '\r\n'
    )
    serverSocket.write(head)
    serverSocket.pipe(clientSocket)
    clientSocket.pipe(serverSocket)
  })
})

// Now that proxy is running
proxy.listen(1337, '127.0.0.1', () => {
  // Make a request to a tunneling proxy
  const options = {
    port: 1337,
    host: '127.0.0.1',
    method: 'CONNECT',
    path: 'www.google.com:80',
  }

  const req = http.request(options)
  console.log('req.end()')
  req.end()

  req.on('connect', (res, socket, head) => {
    console.log('============='.repeat(10))
    console.log('\n\n req.on(connect)')
    console.group({ res, socket, head: head.toString('utf8') })
    console.log(res.statusCode, res.statusMessage)

    // Make a request over an HTTP tunnel
    socket.write(
      'GET / HTTP/1.1\r\n' +
        'Host: www.google.com:80\r\n' +
        'Connection: close\r\n' +
        '\r\n'
    )
    socket.on('data', (chunk) => {
      console.log('incoming chunk...')
    })
    socket.on('end', () => {
      proxy.close()
    })
  })
})
