// lib/adapters/pdf-stream.ts
// @react-pdf returns a Node Readable from renderToStream. The Next.js
// route handler wants a Web ReadableStream. This adapter bridges the
// two. Lives in lib/adapters/ because the typing for `pipe` on a
// Node Readable returning something usable as a transform target
// needs an `any` escape — the surrounding code wraps it in a typed
// boundary.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Readable } from 'node:stream'

export function nodeReadableToWebStream(
  stream: Readable | NodeJS.ReadableStream,
): ReadableStream<Uint8Array> {
  // Node 18+ has Readable.toWeb. Use it if present; otherwise polyfill
  // with a controller pipe.
  const anyStream = stream as any
  if (typeof anyStream?.toWeb === 'function') {
    return anyStream.toWeb() as ReadableStream<Uint8Array>
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      anyStream.on('data', (chunk: Buffer) =>
        controller.enqueue(new Uint8Array(chunk)),
      )
      anyStream.on('end', () => controller.close())
      anyStream.on('error', (err: Error) => controller.error(err))
    },
    cancel() {
      anyStream?.destroy?.()
    },
  })
}
