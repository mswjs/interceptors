import { isNodeProcess } from 'is-node-process'

if (isNodeProcess()) {
  module.exports = {
    interceptWebSocket: require('./node').default,
  }
} else {
  module.exports = {
    interceptWebSocket: require('./browser').default,
  }
}
