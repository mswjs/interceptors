import { IncomingMessage } from 'http'
import { PassThrough } from 'stream'

export const IS_CLONE = Symbol('isClone')

export interface ClonedIncomingMessage extends IncomingMessage {
  [IS_CLONE]: boolean
}

export function cloneIncomingMessage(
  message: IncomingMessage
): ClonedIncomingMessage {
  const stream = message.pipe(new PassThrough());
  mixin(stream, message);

  const prototype = Object.create(IncomingMessage.prototype);
  getPrototypes(stream).forEach(p => {
    mixin(prototype, p);
  });
  Object.setPrototypeOf(stream, prototype);
  Object.defineProperty(stream, IS_CLONE, {
    enumerable: true,
    value: true,
  })
  return stream as unknown as ClonedIncomingMessage
}

function getPrototypes(target: object) {
  const prototypes = [];
  let current = target;
  while (current = Object.getPrototypeOf(current)) {
    prototypes.push(current);
  }
  return prototypes;
}

function mixin(target: object, source: object) {
  const properties = [
    ...Object.getOwnPropertyNames(source),
    ...Object.getOwnPropertySymbols(source),
  ] as Array<keyof typeof source>;
  for (const property of properties) {
    if (target.hasOwnProperty(property)) {
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(source, property);
    Object.defineProperty(target, property, {
      ...descriptor,
    })
  }
}
