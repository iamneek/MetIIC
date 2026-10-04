export const SIGNAL_TYPES = ['ready', 'offer', 'answer', 'ice', 'end'] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export interface SignalMessage {
  type: SignalType
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit | null
  reason?: string
}

const MAX_SIGNAL_BYTES = 64 * 1024 // SDP blobs are a few KB; hard-cap payload sizes.

/** Validate a raw broadcast payload before using it. Returns null if invalid. */
export function parseSignal(raw: unknown): SignalMessage | null {
  let msg: unknown = raw
  if (typeof msg === 'string') {
    if (msg.length > MAX_SIGNAL_BYTES) return null
    try {
      msg = JSON.parse(msg)
    } catch {
      return null
    }
  }
  if (typeof msg !== 'object' || msg === null) return null
  const obj = msg as Record<string, unknown>
  if (typeof obj.type !== 'string' || !(SIGNAL_TYPES as readonly string[]).includes(obj.type)) {
    return null
  }
  const type = obj.type as SignalType
  const out: SignalMessage = { type }
  if (type === 'offer' || type === 'answer') {
    const sdp = obj.sdp as RTCSessionDescriptionInit | undefined
    if (!sdp || typeof sdp !== 'object' || typeof sdp.type !== 'string' || typeof sdp.sdp !== 'string') {
      return null
    }
    if (sdp.sdp.length > MAX_SIGNAL_BYTES) return null
    out.sdp = sdp
  } else if (type === 'ice') {
    if (obj.candidate !== null && typeof obj.candidate !== 'object') return null
    out.candidate = (obj.candidate as RTCIceCandidateInit | null) ?? null
  } else if (type === 'end') {
    if (obj.reason !== undefined && typeof obj.reason !== 'string') return null
    if (typeof obj.reason === 'string') out.reason = obj.reason.slice(0, 100)
  }
  try {
    if (JSON.stringify(out).length > MAX_SIGNAL_BYTES) return null
  } catch {
    return null
  }
  return out
}

export function serializeSignal(msg: SignalMessage): string {
  return JSON.stringify(msg)
}
