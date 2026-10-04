import { useCallback, useEffect, useRef, useState } from 'react'

export type MediaError = 'permission-denied' | 'no-device' | 'in-use' | 'other'

export function classifyMediaError(err: unknown): MediaError {
  const name = (err as { name?: string })?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device'
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use'
  return 'other'
}

export const MEDIA_ERROR_MESSAGES: Record<MediaError, string> = {
  'permission-denied':
    'Camera or microphone access was denied. Allow access in your browser settings, then try again.',
  'no-device': 'No camera or microphone found on this device.',
  'in-use': 'Your camera or microphone is in use by another application.',
  other: 'Could not access your camera or microphone.',
}

export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [error, setError] = useState<MediaError | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  streamRef.current = stream

  const start = useCallback(async () => {
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      })
      streamRef.current = s
      setStream(s)
      setMicOn(true)
      setCamOn(true)
      return s
    } catch (err) {
      setError(classifyMediaError(err))
      return null
    }
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev
      streamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = next
      })
      return next
    })
  }, [])

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev
      streamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = next
      })
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  return { stream, micOn, camOn, error, start, stop, toggleMic, toggleCam }
}
