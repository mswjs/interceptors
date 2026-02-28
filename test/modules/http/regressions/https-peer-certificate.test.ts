// @vitest-environment node
/**
 * @see https://github.com/nock/nock/issues/2930#issuecomment-3960523903
 */
import net from 'node:net'
import tls from 'node:tls'
import https from 'node:https'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../../test/helpers'

const interceptor = new HttpRequestInterceptor()

const httpServer = https.createServer(
  {
    cert: `
-----BEGIN CERTIFICATE-----
MIIDRzCCAi8CFDtKJ0FurS/QAxK6A2cZY7yFCM6CMA0GCSqGSIb3DQEBCwUAMGAx
CzAJBgNVBAYTAkZSMQwwCgYDVQQIDANJZEYxDjAMBgNVBAcMBVBhcmlzMREwDwYD
VQQKDAhTdG9yZGF0YTEMMAoGA1UECwwDRGV2MRIwEAYDVQQDDAlsb2NhbGhvc3Qw
HhcNMjAwNDAxMTA1MTE3WhcNNDcwODE3MTA1MTE3WjBgMQswCQYDVQQGEwJGUjEM
MAoGA1UECAwDSWRGMQ4wDAYDVQQHDAVQYXJpczERMA8GA1UECgwIU3RvcmRhdGEx
DDAKBgNVBAsMA0RldjESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0B
AQEFAAOCAQ8AMIIBCgKCAQEA7uEZtx/xuqr/BMNfFy/KVqNqncgUOqRpme6e+VQd
Y2Vcn+Xovtajkti9Luf6whUPRiCWj0312QWzBQqnryNcmrydAzMfD2MBEfiBZp0L
xKF9p+ETfeIyU5A+bTxo3ejD894QmqgEYiPCBKepWcboaM85NUihEUXbGMWS11n1
MqU7nNTZhI+KWhCMV+EIn7cY0ckd6WWlhw+RPtHosjDQcS/j96HoY4YxyhUMceyD
npJgCffMTiI9Hw6huQSeNVWdnJ3DLUH4JCCAkLHxOWMmNGNKP0h9VwaXRVYnJU9Q
c0oOAHSvzMFznTs4erDsRR+OM/LI3z4sDNNFhKor5QrEYwIDAQABMA0GCSqGSIb3
DQEBCwUAA4IBAQAl1gGK+NfK4A34ztoiMdyocW/WHdCKAmCBlioALc3yKtoc+w7w
wrLqyktmL7YH36gB5AIgpcNkov8RqvIckdc3t6vFs8hzmR6qadKd7SRxKofc/mvv
mAmJY9XweH7yGVqWDSEzisS8xW7rRydwfBNNT9l8JP6xjWOXNpMzm+/3dNrKGywp
XJAPJbp0p9UFdRS9z4Tqeirfi60il/iaM+YVYyMD/sPyyVunu5hRw4HKpK0yiXHC
+pJlWrAhCxBw7Ye0ItN/P1ONMqpDpyzVaExjUJUf2SEgS4E7nbDSRoD7bFjDlUTc
IheCQLxQiuY/x9s0PORBmRG7ozEJe8BKfGUa
-----END CERTIFICATE----- `,
    key: `
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA7uEZtx/xuqr/BMNfFy/KVqNqncgUOqRpme6e+VQdY2Vcn+Xo
vtajkti9Luf6whUPRiCWj0312QWzBQqnryNcmrydAzMfD2MBEfiBZp0LxKF9p+ET
feIyU5A+bTxo3ejD894QmqgEYiPCBKepWcboaM85NUihEUXbGMWS11n1MqU7nNTZ
hI+KWhCMV+EIn7cY0ckd6WWlhw+RPtHosjDQcS/j96HoY4YxyhUMceyDnpJgCffM
TiI9Hw6huQSeNVWdnJ3DLUH4JCCAkLHxOWMmNGNKP0h9VwaXRVYnJU9Qc0oOAHSv
zMFznTs4erDsRR+OM/LI3z4sDNNFhKor5QrEYwIDAQABAoIBAQCEjWgFk7ZBDM3B
yN+lMCGo/bkVoIaJG951SlHwrFo6Y26IU71Y2CWgQKCJvLQKqkD1evPQxUPcjysN
ayItLwQd4PeHZQChOyDG5gx38kErdSkS1PRJ8BBZCjt5xgGy0Yyab+jqyLzV8F2i
055HcPZZ4lMuXAT0Xrz6+/dFhGdpF/CPjLYq/KkX2QXO4Sx6iiVEHYr66Y5rcDGx
n9DHeBAeMh8W/FwGE7LBM5kEM9XkTGBh5u0HHVkauZsJ/3I4DEluDUVMkqayU5Z0
/h2CfnGX1I5wlpHOIB9YniehOVYWfFYl4KwWtQTibJy3H1ZcXUsNI/YR5sUpeA5c
EjhImAZxAoGBAPiPrCknwvs4ud17vfRwi5m3JmSgGEWu0gi4GNetK0XXyLbVWb4N
rD57zVGuXt/MVE2eN+dAmP+bhokR3uLIM8JcOYzr87/6teB1ORfyJB71+Iog59Ti
hMOUNTUUbhlrSQXkmADMXayGGAX5oge5OgJrgcaejOQJ7cwAoRIeVck9AoGBAPYH
QDeQ6fvcAysYLWrbbFFmyKGLuT0sy4boj9qqUXkKcTvaU9uk73/oQrrdJJ+VH47L
J4KgLmLr4XxvJsW/9Lj7DAoIptL/JiraRI40T2bTJbuej38SYF1aHACHj0P1Bb5j
pUEllDLT1DShxxCduSULepoqwFo99rHRL1Kp/14fAoGAUq8wfQxOD1YCdkwYl3zs
43iKnASprlyGYAIluXFQqM4sZa25ScCwoKR8W4Se6OHG1X8hZ5sUiksJSQWZ2GTy
2t/lARzom99hq0YzdOTG4Um/oOtrU2T69ziRLpQaP/hxdTVi3zkcnCyLR0mQffM+
+dkbdZ/+jElFQoyfCDDxJp0CgYEA9WmkMAlYrYf4jRsv6sB32vcZOLOkkpZFaww+
utNcM84rx5VwQs/Sq5cmQTnol1rsQMb7YXyg6MH8ieBiH63r0j1x8+xPZHdpPiO9
cNBTR/FlWTLAVvQgtd31wr12NkaKdTD2nfZ7TvwoWFvrsvJxxbcek/wDJcFbfGJ6
vw2eEucCgYAH7UURHZBeTY6faj0jjtwwWEavFPlIN2ytg44cn5OXvlZWuJ/C36ve
UNj277WBVCQGTnbMRdj5CokdUz/Y2coLZCRsPv8dMCiymC7Wzib63PF0F2zApZrG
g2wjK5TFm7cVzl/Bm0EZnpf/kQ2+QQGroeVQqoGkELEqj3FlDFW1Dw==
-----END RSA PRIVATE KEY-----
  `,
  },
  (req, res) => {
    res.writeHead(200).end()
  }
)

beforeAll(async () => {
  interceptor.apply()

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve)
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
})

it('supports a custom HTTPS agent that assigns the socket certificate', async () => {
  class CustomHttpsAgent extends https.Agent {
    public certificate?: tls.PeerCertificate

    constructor() {
      super({ rejectUnauthorized: false })

      this.once('keylog', (line, socket: tls.TLSSocket) => {
        socket.once('secureConnect', () => {
          this.certificate = socket.getPeerCertificate(false)
        })
      })
    }
  }

  const agent = new CustomHttpsAgent()
  const request = https.request({
    host: '127.0.0.1',
    port: (httpServer.address() as net.AddressInfo).port,
    agent,
  })
  request.end()

  await toWebResponse(request)

  expect(agent.certificate).toEqual(
    expect.objectContaining({
      fingerprint:
        'AC:E6:F1:6B:7A:41:2D:3F:13:E2:64:81:29:C3:4F:94:B1:A5:34:E6',
      pubkey: expect.any(Buffer),
      valid_from: expect.any(String),
      valid_to: expect.any(String),
    })
  )
})
