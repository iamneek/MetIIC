export type CallStatus =
  | 'waiting'
  | 'matched'
  | 'connecting'
  | 'connected'
  | 'ending'
  | 'ended'
  | 'failed'

export const TERMINAL_STATUSES: readonly CallStatus[] = ['ended', 'failed']

const TRANSITIONS: Record<CallStatus, readonly CallStatus[]> = {
  waiting: ['matched', 'ending', 'ended', 'failed'],
  matched: ['connecting', 'ending', 'ended', 'failed'],
  connecting: ['connected', 'ending', 'ended', 'failed'],
  connected: ['ending', 'ended', 'failed'],
  ending: ['ended', 'failed'],
  ended: [],
  failed: [],
}

/** Guard used by UI and tests: may the call move from -> to? */
export function canTransition(from: CallStatus, to: CallStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: CallStatus, to: CallStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal call state transition: ${from} -> ${to}`)
  }
}

export function isLive(status: CallStatus): boolean {
  return status === 'matched' || status === 'connecting' || status === 'connected'
}
