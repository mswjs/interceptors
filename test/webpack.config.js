const path = require('path')

module.exports = {
  target: 'web',
  resolve: {
    alias: {
      'node-request-interceptor': path.resolve(__dirname, '..'),
    },
  },
}
