import { Emitter, type DefaultEventMap } from 'rettime'

/**
 * A typed event target that owns its emitter internally and exposes
 * only the listener-facing surface (`on`/`once`/`removeListener`/
 * `removeAllListeners`). Dispatching stays internal to the subclass
 * (`this.emitter`), so consumers cannot emit events they do not own.
 */
export abstract class SmtpEventTarget<Events extends DefaultEventMap> {
  protected emitter = new Emitter<Events>()

  public on<Type extends keyof Events & string>(
    type: Type,
    listener: Emitter.Listener<Emitter<Events>, Type>
  ): this {
    this.emitter.on(type, listener)
    return this
  }

  public once<Type extends keyof Events & string>(
    type: Type,
    listener: Emitter.Listener<Emitter<Events>, Type>
  ): this {
    this.emitter.once(type, listener)
    return this
  }

  public earlyOn<Type extends keyof Events & string>(
    type: Type,
    listener: Emitter.Listener<Emitter<Events>, Type>
  ): this {
    this.emitter.earlyOn(type, listener)
    return this
  }

  public earlyOnce<Type extends keyof Events & string>(
    type: Type,
    listener: Emitter.Listener<Emitter<Events>, Type>
  ): this {
    this.emitter.earlyOnce(type, listener)
    return this
  }

  public removeListener<Type extends keyof Events & string>(
    type: Type,
    listener: Emitter.Listener<Emitter<Events>, Type>
  ): this {
    this.emitter.removeListener(type, listener)
    return this
  }

  public removeAllListeners<Type extends keyof Events & string>(
    type?: Type
  ): this {
    this.emitter.removeAllListeners(type)
    return this
  }

  public listeners<Type extends keyof Events & string>(
    type?: Type
  ): Array<Emitter.Listener<Emitter<Events>, Type>> {
    return this.emitter.listeners(type)
  }

  public listenerCount<Type extends keyof Events & string>(
    type?: Type
  ): number {
    return this.emitter.listenerCount(type)
  }
}
