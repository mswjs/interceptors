/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { createServer, ServerApi } from '@open-draft/test-server'
import { RequestHandler } from 'express'
import { createBrowserXMLHttpRequest } from '../../helpers'

let httpServer: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'XMLHttpRequest.browser.runtime.js'),
  })
}

beforeAll(async () => {
  httpServer = await createServer((app) => {
    const requestHandler: RequestHandler = (req, res) => {
      res.status(200).send('user-body').end()
    }

    app.get('/user', requestHandler)
    app.post('/user', requestHandler)
  })
})

afterAll(async () => {
  await httpServer.close()
})

test('intercepts an HTTP GET request', async () => {
  const context = await prepareRuntime()
  const request = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const response = await request(
    'GET',
    url,
    {
      'x-request-header': 'yes',
    },
    undefined,
    {
      expected: {
        method: 'GET',
        url,
        headers: {
          'x-request-header': 'yes',
        },
        body: '',
      },
    }
  )

  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.body).toEqual('user-body')
})

test('intercepts an HTTP POST request', async () => {
  const context = await prepareRuntime()
  const request = createBrowserXMLHttpRequest(context)
  const url = httpServer.http.makeUrl('/user')
  const response = await request(
    'POST',
    url,
    {
      'x-request-header': 'yes',
    },
    JSON.stringify({ user: 'john' }),
    {
      expected: {
        method: 'POST',
        url,
        headers: {
          'x-request-header': 'yes',
        },
        body: JSON.stringify({ user: 'john' }),
      },
    }
  )

  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.body).toEqual('user-body')
})
