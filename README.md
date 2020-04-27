# `node-request-interceptor`

Low-level HTTP/HTTPS request interception library for NodeJS.

Supports the following request issuers:

- `http.request()`
- `https.request()`
- `XMLRequest`
- `fetch()`

## Motivation

While there are a lot of network communication mocking libraries, they tend to use request interception as an implementation detail, exposing you a high-level API for matching requests.

This library allows you to execute arbitrary logic whenever an HTTP/HTTPS request happens. Through that logic you can set up logging or mocking, depending on your requirements.

## How does this work?

...
