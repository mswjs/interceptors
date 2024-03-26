import { crypto } from '../src/crypto-shim'

Reflect.set(globalThis, 'crypto', crypto)
