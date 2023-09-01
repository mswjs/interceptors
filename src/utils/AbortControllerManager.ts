import { Logger } from '@open-draft/logger'

export const instanceSymbolAbortControllerManager: unique symbol = Symbol('AbortControllerManager');
export const decoratorSymbol: unique symbol = Symbol('DecoratedAbortController');

export class AbortControllerManager {
  private logger: Logger
  private pureAbortController: typeof AbortController | undefined
  private referencedAbortControllers= new WeakMap<AbortSignal, WeakRef<AbortController>>();
  private registeredAbortControllers = new Map<AbortSignal, AbortController>();

  constructor() {
    this.logger = new Logger('AbortControllerManager');

    const runningInstance = this.getRunningInstance()

    if (runningInstance) {
      this.logger.debug("returning the existing instance");
      return runningInstance
    }

    this.pureAbortController = AbortController

    Object.defineProperty(globalThis, instanceSymbolAbortControllerManager, {
      enumerable: true,
      configurable: true,
      value: this,
    })
  }

  private getRunningInstance(): AbortControllerManager | undefined {
    // @ts-ignore
    return globalThis[instanceSymbolAbortControllerManager]
  }

  private getReferencedAbortControllers() {
    return this.referencedAbortControllers
  }

  private getPureAbortController(): typeof AbortController {
    return this.pureAbortController ?? globalThis.AbortController
  }

  decorate(): boolean {
    if (this.isDecorated()) {
      this.logger.debug('already decorated')
      return false
    }

    const pureAbortController = this.getPureAbortController()
    const logger = this.logger
    const getGlobalAbortControllers = () => this.getReferencedAbortControllers()

    const decorator = class CustomAbortController {
      constructor() {
        const abortController = new pureAbortController()
        getGlobalAbortControllers().set(abortController.signal, new WeakRef(abortController))
        logger.debug('AbortController registered')
        return abortController
      }
    }

    Object.defineProperty(decorator, decoratorSymbol, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    Object.defineProperty(globalThis, 'AbortController', {
      enumerable: true,
      configurable: true,
      value: decorator,
    })

    this.logger.info('native "AbortController" patched!')
    return true
  }

  restore(): boolean {
    if (!this.isDecorated()) {
      this.logger.info('nothing to restore.')
      return false
    }

    Object.defineProperty(globalThis, 'AbortController', {
      enumerable: true,
      configurable: true,
      value: this.getPureAbortController(),
    })

    this.logger.info('native "AbortController" restored!')
    return true
  }

  registerSignal(signal: AbortSignal): boolean {
    const controllerWeakRef = this.referencedAbortControllers.get(signal)

    /**
     * If the controller is not found, it means one of two things :
     * 1) it has been created before the interceptor setup
     * 2) it has been garbage collected
     *
     * Case (1) means this controller is outside of the scope of MSW,
     * therefore it is not the responsibility of the interceptor to handle its behavior during shutdown.
     *
     * Case (2) means the last ref to AbortController.signal has been dropped before the request was intercepted.
     * This indicates that the test might be flaky and the user may benefit from a warning by
     * the test runner about open handles.
     * For this reason it is correct to not handle its behavior during shutdown.
     */
    if (controllerWeakRef === undefined) {
      this.logger.debug('AbortController not found in the global map')
      return false
    }

    const controller = controllerWeakRef.deref()

    if (controller === undefined) {
      this.logger.debug('AbortController has been garbage collected before it could be registered')
      return false
    }

    this.registeredAbortControllers.set(signal, controller)
    return true
  }

  forgetSignal(signal: AbortSignal) {
    this.referencedAbortControllers.delete(signal);
    this.registeredAbortControllers.delete(signal);
  }

  isDecorated() {
    // @ts-ignore
    return globalThis.AbortController[decoratorSymbol] === true
  }

  isReferenced(controller: AbortController) {
    return this.referencedAbortControllers.has(controller.signal);
  }

  isRegistered(controller: AbortController) {
    return this.registeredAbortControllers.has(controller.signal);
  }

  abortAll(): number {
    let i = 0
    this.registeredAbortControllers.forEach(c => {
      if (c.signal.aborted) return
      i++
      c.abort()
    })

    return i;
  }

  dispose() {
    this.logger.debug('dispose')
    this.restore()
    this.abortAll()
    this.referencedAbortControllers = new WeakMap()
    this.registeredAbortControllers.clear()
  }
}
