import { readTable, type Context, type ReadResult } from './roster'

/** readTable in a web worker when the browser has one, on the main thread otherwise (tests, very old browsers). Small inputs always run directly: starting a worker costs more than reading them. */
export function readAsync(text: string, ctx: Context): Promise<ReadResult> {
  if (typeof Worker === 'undefined' || text.length < 200_000) return Promise.resolve(readTable(text, ctx))
  return new Promise((resolve) => {
    let w: Worker
    try { w = new Worker(new URL('./readWorker.ts', import.meta.url), { type: 'module' }) } catch { resolve(readTable(text, ctx)); return }
    w.onmessage = (e: MessageEvent<ReadResult>) => { resolve(e.data); w.terminate() }
    w.onerror = () => { w.terminate(); resolve(readTable(text, ctx)) }
    w.postMessage({ text, ctx })
  })
}
