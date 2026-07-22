import { createRequestId } from './create-request-id'
import { REQUEST_ID_REGEXP } from '../test/helpers'

it('returns a request ID', () => {
  expect(createRequestId()).toMatch(REQUEST_ID_REGEXP)
})
