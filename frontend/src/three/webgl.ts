/** True when the browser can create a WebGL context. Checked once; a failed check shows the 2D fallback card. */
let cached: boolean | null = null
export function hasWebGL(): boolean {
  if (cached != null) return cached
  try {
    const c = document.createElement('canvas')
    cached = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { cached = false }
  return cached
}
