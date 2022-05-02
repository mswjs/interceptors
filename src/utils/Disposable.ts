export type DisposableSubscription = () => unknown

/**
 * A generic class that accumulates side-effect subscriptions
 * and disposes of them on demand.
 */
export class Disposable {
  protected subscriptions: DisposableSubscription[] = []

  public dispose(): void {
    let subscription: DisposableSubscription | undefined

    while ((subscription = this.subscriptions.pop())) {
      subscription()
    }
  }
}
