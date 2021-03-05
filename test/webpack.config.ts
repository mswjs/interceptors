import * as path from 'path'

export default {
  target: 'web',
  resolve: {
    alias: {
      'node-request-interceptor': path.resolve(__dirname, '..'),
    },
  },
}
