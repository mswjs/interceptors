import { RequestController } from './RequestController'

export type InteractiveRequest = globalThis.Request & {
  respondWith: RequestController['respondWith']
}

export function toInteractiveRequest(request: Request): {
  interactiveRequest: InteractiveRequest
  requestController: RequestController
} {
  const requestController = new RequestController(request)

  Reflect.set(
    request,
    'respondWith',
    requestController.respondWith.bind(requestController)
  )

  return {
    interactiveRequest: request as InteractiveRequest,
    requestController,
  }
}
