import { invariant } from 'outvariant'

const IS_PATCHED_MODULE: unique symbol = Symbol.for('kIsPatchedModule')

/**
 * Apply a patch for the given property on the owner object.
 * Returns a function that reverts that patch.
 */
export function applyPatch<T extends Record<any, any>, K extends keyof T>(
  owner: T,
  key: K,
  patch: (realValue: T[K]) => T[K]
): () => void {
  const realValue = owner[key]

  invariant(!realValue[IS_PATCHED_MODULE], 'Failed to patch "%s"', key)

  const originalDescriptor = Object.getOwnPropertyDescriptor(owner, key)

  if (originalDescriptor) {
    Object.defineProperty(owner, key, {
      value: patch(realValue),
      configurable: true,
    })
  } else {
    owner[key] = patch(realValue)
  }

  Object.defineProperty(realValue, IS_PATCHED_MODULE, {
    value: true,
    enumerable: false,
    configurable: true,
  })

  return () => {
    /**
     * @note If the property was defined as a descriptor, preserve it.
     * For example, `globalThis.WebSocket` is defined that way in browser-likes.
     */
    if (originalDescriptor) {
      Object.defineProperty(owner, key, originalDescriptor)
    } else {
      owner[key] = realValue
    }

    Object.defineProperty(realValue, IS_PATCHED_MODULE, {
      value: undefined,
    })
  }
}
