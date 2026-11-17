import { readTable, type Context } from './roster'

/** Runs readTable off the main thread, so a year of daily logs for a whole depot does not freeze the page. */
const w = self as unknown as { onmessage: ((e: MessageEvent<{ text: string; ctx: Context }>) => void) | null; postMessage: (m: unknown) => void }
w.onmessage = (e) => w.postMessage(readTable(e.data.text, e.data.ctx))
