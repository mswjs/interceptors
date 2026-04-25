// Hermes has no TransformStream. See mswjs/msw#2367.
export function decompressResponse(
  _response: Response,
): ReadableStream<any> | null {
  return null
}
