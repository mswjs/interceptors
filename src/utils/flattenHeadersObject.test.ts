import { flattenHeadersObject } from './flattenHeadersObject'

describe('flattenHeadersObject', () => {
  describe('given a headers object', () => {
    let result: ReturnType<typeof flattenHeadersObject>

    beforeAll(() => {
      result = flattenHeadersObject({
        'Accept-Language': 'us-US',
        'Content-Type': ['application/json', 'text/plain'],
      })
    })

    it('should have single values intact', () => {
      expect(result).toHaveProperty('Accept-Language', 'us-US')
    })

    it('should join a list of values into a string', () => {
      expect(result).toHaveProperty(
        'Content-Type',
        'application/json; text/plain'
      )
    })
  })
})
