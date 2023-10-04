export class NodeError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
  }
}