/**
 * Node/TS’te Buffer → Uint8Array<ArrayBufferLike> ile
 * Prisma/Response’un beklediği Uint8Array<ArrayBuffer> çakışmasını giderir.
 */
export function toArrayBufferBytes(
  data: ArrayBufferView | Buffer,
): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
  copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return copy;
}
