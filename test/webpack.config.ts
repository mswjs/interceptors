import * as path from 'path'
import * as webpack from 'webpack'

const webpackConfig: webpack.Configuration = {
  target: 'web',
  module: {
    rules: [
      {
        test: /\.(js|mjs|ts)$/,
        exclude: /node_modules/,
        type: 'javascript/esm',
      },
    ],
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_DEBUG: JSON.stringify(true),
    }),
  ],
  resolve: {
    alias: {
      '@mswjs/interceptors': path.resolve(__dirname, '..'),
    },
  },
}

export default webpackConfig
