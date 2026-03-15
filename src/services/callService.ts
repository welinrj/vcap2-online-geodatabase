import { realtimeDb } from '../config/firebase'
import {
  ref,
  set,
  onValue,
  remove,
  off,
} from 'firebase/database'
import type { CallSignal } from '../types/messaging'

const CALLS_PATH = 'calls'
const ICE_CANDIDATES_PATH = 'ice_candidates'

function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ─── Call Signaling ───────────────────────────────

export async function createCall(
  callerId: string,
  callerName: string,
  callerAvatar: string | null | undefined,
  calleeId: string,
  calleeName: string,
  type: 'video' | 'audio',
): Promise<string> {
  if (!realtimeDb) throw new Error('Realtime DB not configured')
  const callId = generateCallId()
  const signal: CallSignal = {
    id: callId,
    callerId,
    callerName,
    callerAvatar: callerAvatar || null,
    calleeId,
    calleeName,
    type,
    status: 'ringing',
    createdAt: new Date().toISOString(),
  }
  await set(ref(realtimeDb, `${CALLS_PATH}/${callId}`), signal)
  return callId
}

export async function setCallOffer(callId: string, offer: string): Promise<void> {
  if (!realtimeDb) return
  await set(ref(realtimeDb, `${CALLS_PATH}/${callId}/offer`), offer)
}

export async function setCallAnswer(callId: string, answer: string): Promise<void> {
  if (!realtimeDb) return
  await set(ref(realtimeDb, `${CALLS_PATH}/${callId}/answer`), answer)
  await set(ref(realtimeDb, `${CALLS_PATH}/${callId}/status`), 'active')
}

export async function endCall(callId: string): Promise<void> {
  if (!realtimeDb) return
  await set(ref(realtimeDb, `${CALLS_PATH}/${callId}/status`), 'ended')
  // Cleanup after a short delay
  setTimeout(async () => {
    try {
      await remove(ref(realtimeDb!, `${CALLS_PATH}/${callId}`))
      await remove(ref(realtimeDb!, `${ICE_CANDIDATES_PATH}/${callId}`))
    } catch {
      // Ignore cleanup errors
    }
  }, 3000)
}

export async function declineCall(callId: string): Promise<void> {
  if (!realtimeDb) return
  await set(ref(realtimeDb, `${CALLS_PATH}/${callId}/status`), 'declined')
  setTimeout(async () => {
    try {
      await remove(ref(realtimeDb!, `${CALLS_PATH}/${callId}`))
      await remove(ref(realtimeDb!, `${ICE_CANDIDATES_PATH}/${callId}`))
    } catch {
      // Ignore cleanup errors
    }
  }, 3000)
}

// ─── ICE Candidates ───────────────────────────────

export async function addIceCandidate(
  callId: string,
  role: 'caller' | 'callee',
  candidate: RTCIceCandidateInit,
): Promise<void> {
  if (!realtimeDb) return
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  await set(
    ref(realtimeDb, `${ICE_CANDIDATES_PATH}/${callId}/${role}/${id}`),
    JSON.stringify(candidate),
  )
}

export function onIceCandidates(
  callId: string,
  role: 'caller' | 'callee',
  callback: (candidate: RTCIceCandidateInit) => void,
): () => void {
  if (!realtimeDb) return () => {}
  const path = ref(realtimeDb, `${ICE_CANDIDATES_PATH}/${callId}/${role}`)
  const handler = onValue(path, (snap) => {
    if (!snap.exists()) return
    const data = snap.val() as Record<string, string>
    Object.values(data).forEach((candidateJson) => {
      try {
        callback(JSON.parse(candidateJson))
      } catch {
        // Ignore parse errors
      }
    })
  })
  // Return cleanup (onValue returns an Unsubscribe)
  void handler
  return () => off(path)
}

// ─── Call Listeners ───────────────────────────────

/** Listen for call signal changes */
export function onCallChanged(
  callId: string,
  callback: (signal: CallSignal | null) => void,
): () => void {
  if (!realtimeDb) return () => {}
  const callRef = ref(realtimeDb, `${CALLS_PATH}/${callId}`)
  onValue(callRef, (snap) => {
    if (!snap.exists()) {
      callback(null)
      return
    }
    callback(snap.val() as CallSignal)
  })
  return () => off(callRef)
}

/** Listen for incoming calls for a user */
export function onIncomingCalls(
  userId: string,
  callback: (calls: CallSignal[]) => void,
): () => void {
  if (!realtimeDb) return () => {}
  const callsRef = ref(realtimeDb, CALLS_PATH)
  onValue(callsRef, (snap) => {
    if (!snap.exists()) {
      callback([])
      return
    }
    const data = snap.val() as Record<string, CallSignal>
    const incoming = Object.values(data).filter(
      (c) => c.calleeId === userId && c.status === 'ringing',
    )
    callback(incoming)
  })
  return () => off(callsRef)
}
