import { Link } from 'react-router-dom'
import type { Lens } from '../three/viewState'

/** Jumps to the 3D bus with the matching lens already selected. */
export function OpenIn3D({ lens, label }: { lens: Lens; label: string }) {
  return (
    <Link className="btn sm o3d" to="/" state={{ lens }}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5zM2 5l6 3.5L14 5M8 8.5v6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      {label}
    </Link>
  )
}
