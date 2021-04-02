/**
 * @jest-environment node
 * @see https://github.com/mswjs/interceptors/issues/109
 */
import got from 'got';
import compression from 'compression';
import * as zlib from 'zlib';

import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor, IsomorphicResponse } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(req) {
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.use(compression( { threshold: 1, }));
    app.get('/', (req, res) =>
      res.send({hello: 'world'}));
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

const GZIP_MAGIC_HEX = '1f8b08';

test('returns a valid body', async () => {
  const intercepted = new Promise<IsomorphicResponse>(resolve =>
    interceptor.on('response', (req, resp) =>
      resolve(resp)));
  expect(await got(server.http.makeUrl('/')).json()).toEqual({hello: 'world'});
  const resp = await intercepted;
  expect(resp.headers.get('content-encoding')).toBe('gzip')
  const bodyBuffer = Buffer.from(resp.body!);
  expect(bodyBuffer.slice(0, 3).toString('hex')).toBe(GZIP_MAGIC_HEX);
  const unzipped = zlib.gunzipSync(bodyBuffer).toString('utf-8');
  expect(JSON.parse(unzipped)).toEqual({hello: 'world'});
})
