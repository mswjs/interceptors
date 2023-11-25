/**
 * React Native-like environment for Vitest.
 */
import type { Environment } from 'vitest'
import { builtinEnvironments } from 'vitest/environments'

export default <Environment>{
  name: 'react-native-like',
  async setup(global, options) {
    const { teardown } = await builtinEnvironments.jsdom.setup(global, options)

    // React Native does not have the global "location" property.
    Reflect.deleteProperty(globalThis, 'window')
    Reflect.deleteProperty(globalThis, 'location')

    return {
      teardown,
    }
  },
}
