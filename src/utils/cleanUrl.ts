/**
 * Strips query parameters and hashes from the given URL.
 */
export function cleanUrl(url: URL): string {
  return `${url.origin}${url.pathname}`
}
