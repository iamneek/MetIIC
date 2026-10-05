export interface DiagEvent {
  at: number
  tag: string
  message: string
}

const MAX = 120
let buffer: DiagEvent[] = []
const listeners = new Set<(e: DiagEvent) => void>()

/**
 * Lightweight diagnostics that work in production builds (console output is not
 * stripped by Vite) and are also rendered in an in-app debug panel so a
 * temporary domain can be tested without opening devtools.
 */
export function logDiag(tag: string, message: string): void {
  const event: DiagEvent = { at: Date.now(), tag, message }
  buffer = [...buffer, event].slice(-MAX)
  // eslint-disable-next-line no-console
  console.info(`[${tag}] ${message}`)
  listeners.forEach((l) => l(event))
}

export function getDiagEvents(): DiagEvent[] {
  return buffer
}

export function subscribeDiag(cb: (e: DiagEvent) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function clearDiag(): void {
  buffer = []
}