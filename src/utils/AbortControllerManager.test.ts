import { afterEach, describe, expect, test } from 'vitest'
import { AbortControllerManager } from './AbortControllerManager'

describe('AbortControllerManager', () => {
  const manager = new AbortControllerManager()

  afterEach(() => {
    if (manager) {
      manager.dispose()
    }
  })

  test('global AbortController is not decorated if patch is not applied yet', () => {
    const pureAbortController = AbortController

    expect(AbortController).toBe(pureAbortController)
    expect(manager.isDecorated()).toBeFalsy()
  })

  test('global AbortController is decorated if patch is applied', () => {
    const pureAbortController = AbortController
    manager.decorate()

    expect(AbortController).not.toBe(pureAbortController)
    expect(manager.isDecorated()).toBeTruthy()
  })

  test('new AbortControllers are referenced if patch is applied', () => {
    manager.decorate()

    const controller = new AbortController()

    expect(manager.isReferenced(controller)).toBeTruthy()
    expect(manager.isRegistered(controller)).toBeFalsy()
  })

  test('registering a AbortSignal add the controller into the request map', () => {
    manager.decorate()

    const controller = new AbortController()
    manager.registerSignal(controller.signal)

    expect(manager.isRegistered(controller)).toBeTruthy()
  })

  test('global AbortController is restored if restoreAbortController is called', () => {
    manager.decorate()

    const controller = new AbortController()

    manager.restore()

    const controller2 = new AbortController()

    expect(manager.isReferenced(controller)).toBeTruthy()
    expect(manager.isReferenced(controller2)).toBeFalsy()
  })

  test('restoring AbortController do not clear the maps', () => {
    manager.decorate()

    const controller = new AbortController()

    manager.registerSignal(controller.signal)
    manager.restore()

    expect(manager.isReferenced(controller)).toBeTruthy()
    expect(manager.isRegistered(controller)).toBeTruthy()
  })

  test('calling dispose() restore the AbortController and clear the maps', () => {
    manager.decorate()

    const controller = new AbortController()
    manager.registerSignal(controller.signal)

    expect(manager.isReferenced(controller)).toBeTruthy()
    expect(manager.isRegistered(controller)).toBeTruthy()

    manager.dispose()

    expect(manager.isReferenced(controller)).toBeFalsy()
    expect(manager.isRegistered(controller)).toBeFalsy()

    const controller2 = new AbortController()

    expect(manager.isReferenced(controller2)).toBeFalsy()
  })

  test('creating a new instance of the manager returns the existing one', () => {
    const manager2 = new AbortControllerManager()
    expect(manager).toBe(manager2)
  })

  test('calling abortAll() abort all registered controllers', () => {
    manager.decorate()

    const controller = new AbortController()
    const controller2 = new AbortController()
    const controller3 = new AbortController()

    manager.registerSignal(controller.signal)
    manager.registerSignal(controller2.signal)

    manager.abortAll()

    expect(controller.signal.aborted).toBeTruthy()
    expect(controller2.signal.aborted).toBeTruthy()
    expect(controller3.signal.aborted).toBeFalsy()
  })

  test('calling dispose() abort all registered controllers', () => {
    manager.decorate()

    const controller = new AbortController()
    const controller2 = new AbortController()
    const controller3 = new AbortController()

    manager.registerSignal(controller.signal)
    manager.registerSignal(controller2.signal)

    manager.dispose()

    expect(controller.signal.aborted).toBeTruthy()
    expect(controller2.signal.aborted).toBeTruthy()
    expect(controller3.signal.aborted).toBeFalsy()
  })


  test('calling forget() removes the controller from the references map and registration map', () => {
    manager.decorate()

    const controller = new AbortController()

    manager.registerSignal(controller.signal)

    expect(manager.isReferenced(controller)).toBeTruthy()
    expect(manager.isRegistered(controller)).toBeTruthy()

    manager.forgetSignal(controller.signal)

    expect(manager.isReferenced(controller)).toBeFalsy()
    expect(manager.isRegistered(controller)).toBeFalsy()
  })
})