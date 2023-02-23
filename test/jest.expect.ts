import { HeadersObject } from 'headers-polyfill'
import { AsymmetricMatcher } from 'expect/build/asymmetricMatchers'
import { UUID_REGEXP } from './helpers'

/**
 * A custom asymetric matcher that asserts the `Headers` object.
 */
class HeadersContaining extends AsymmetricMatcher<Record<string, unknown>> {
  constructor(sample: Record<string, unknown>, inverse = false) {
    super(sample, inverse)
  }

  asymmetricMatch(other: Headers) {
    return Object.entries(this.sample).every(([name, value]) => {
      return other.get(name) === value
    })
  }

  toString() {
    return 'HeadersContaining'
  }

  getExpectedType() {
    return 'Headers'
  }

  toAsymmetricMatcher() {
    return JSON.stringify(this.sample)
  }
}

export class AnyUuid extends AsymmetricMatcher<string> {
  constructor() {
    super('', false)
  }

  asymmetricMatch(other: string) {
    return UUID_REGEXP.test(other)
  }

  toString() {
    return 'AnyUuid'
  }

  toAsymmetricMatcher() {
    return String(UUID_REGEXP)
  }
}

export const headersContaining = (expected: HeadersObject): any => {
  return new HeadersContaining(expected)
}

export const anyUuid = (): any => {
  return new AnyUuid()
}
