import * as path from 'path'
import * as webpack from 'webpack'

export default {
  target: 'web',
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_DEBUG: JSON.stringify(true),
    }),
  ],
  resolve: {
    alias: {
      'node-request-interceptor': path.resolve(__dirname, '..'),
    },
  },
}
