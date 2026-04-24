import type { RequestController } from './RequestController'

/**
 * @note Export `RequestController` as a type only.
 * It's never meant to be created in the userland.
 */
export type { RequestController }

export type RequestCredentials = 'omit' | 'include' | 'same-origin'
