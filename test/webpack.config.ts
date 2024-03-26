import * as path from 'path'
import * as webpack from 'webpack'

const webpackConfig: webpack.Configuration = {
  target: 'web',
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_DEBUG: JSON.stringify(true),
    }),
  ],
  resolve: {
    alias: {
      '@mswjs/interceptors': path.resolve(__dirname, '..'),
    },
    fallback: {
      /**
       * @note webpack has trouble understanding the "crypto" global in the browser.
       */
      crypto: false,
    },
  },
}

export default webpackConfig
