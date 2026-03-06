import { TestProject } from 'vitest/node'
import { HttpServer } from '@open-draft/test-server/http'
import { useCors } from './test/helpers'

const server = new HttpServer((app) => {
  app.use(useCors)

  app.get('/redirect', (req, res) => {
    const baseUrl = new URL(
      `${req.secure ? 'https' : 'http'}://${req.get('host')}/`
    )

    res
      .status(301)
      .set({ location: new URL('/redirect/destination', baseUrl) })
      .end()
  })
  app.get('/redirect/destination', (req, res) => {
    res.status(200).send('destination-body')
  })

  app.all('*', (req, res) => {
    res.status(200).set(req.headers)

    if (req.method === 'GET') {
      res.send('original-response')
    } else {
      req.pipe(res)
    }
  })
})

export async function setup(project: TestProject) {
  await server.listen()

  project.provide('server', {
    http: server.http.address.href,
    https: server.https.address.href,
  })
}

export async function teardown() {
  await server.close()
}
