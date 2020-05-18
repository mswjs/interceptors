import axios, { AxiosResponse } from 'axios'
import { RequestInterceptor } from '../../src'

describe('axios', () => {
  let interceptor: RequestInterceptor

  beforeAll(() => {
    interceptor = new RequestInterceptor()
    interceptor.use((req) => {
      if (req.url.pathname === '/user') {
        return {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-header': 'yes',
          },
          body: JSON.stringify({
            mocked: true,
          }),
        }
      }
    })
  })

  afterAll(() => {
    interceptor.restore()
  })

  describe('given I perform an axios.get request', () => {
    let res: AxiosResponse

    beforeAll(async () => {
      res = await axios.get('/user')
    })

    it('should return mocked status code', () => {
      expect(res.status).toEqual(200)
    })

    it('should return mocked headers', () => {
      expect(res.headers).toHaveProperty('x-header', 'yes')
    })

    it('should return mocked body', () => {
      expect(res.data).toEqual({ mocked: true })
    })
  })

  describe('given I perform an axios.post request', () => {
    let res: AxiosResponse

    beforeAll(async () => {
      res = await axios.post('/user')
    })

    it('should return mocked status code', () => {
      expect(res.status).toEqual(200)
    })

    it('should return mocked headers', () => {
      expect(res.headers).toHaveProperty('x-header', 'yes')
    })

    it('should return mocked body', () => {
      expect(res.data).toEqual({ mocked: true })
    })
  })
})
