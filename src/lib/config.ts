export const APP_NAME: string = import.meta.env.VITE_APP_NAME || 'MetIIC'

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const CONNECTION_TIMEOUT_MS: number = Number(
  import.meta.env.VITE_CONNECTION_TIMEOUT_MS || 20000,
)

export const ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  import.meta.env.VITE_ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all'

export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = []
  const stunRaw: string = import.meta.env.VITE_STUN_URLS || ''
  const stuns = stunRaw
    .split(',')
    .map((s) => s.replace(/\s+/g, ''))
    .filter((s) => s.startsWith('stun:') || s.startsWith('stuns:'))
  if (stuns.length > 0) {
    servers.push({ urls: stuns })
  } else {
    servers.push({ urls: ['stun:stun.l.google.com:19302'] })
  }
  const turnUrl = import.meta.env.VITE_TURN_URL
  if (turnUrl) {
    const urls = turnUrl
      .split(',')
      .map((s: string) => s.replace(/\s+/g, ''))
      .filter((s: string) => s.startsWith('turn:') || s.startsWith('turns:'))
    if (urls.length > 0) {
      const username = (import.meta.env.VITE_TURN_USERNAME || '').trim() || undefined
      const credential = (import.meta.env.VITE_TURN_CREDENTIAL || '').trim() || undefined
      servers.push({
        urls,
        username,
        credential,
      })
    }
  }
  return servers
}
