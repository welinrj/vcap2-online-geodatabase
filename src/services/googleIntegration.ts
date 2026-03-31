/**
 * Google Integration Service
 * Uses Google Identity Services (GIS) token model — no npm packages.
 * Loads the GIS script dynamically.
 */

import { db, auth } from '../config/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'

/** Ensure Firebase anonymous auth session exists before any Firestore write */
async function ensureAuth(): Promise<void> {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth)
    } catch {
      // Non-fatal — catch-all rules allow reads; writes may still fail
    }
  }
}

// ─── Window type declarations ─────────────────────────────────────────────────

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }): TokenClient
          revoke(token: string, callback?: () => void): void
        }
      }
    }
  }
}

interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}

// ─── Module-level token storage ───────────────────────────────────────────────

/** Currently active OAuth access token (module-level for cross-component access) */
export let storedToken: string | null = null

/** Get the currently stored access token */
export function getStoredToken(): string | null {
  return storedToken
}

/** Set the stored token (called after successful auth) */
export function setStoredToken(token: string | null): void {
  storedToken = token
}

// ─── GIS Script Loading ───────────────────────────────────────────────────────

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
let gisLoadPromise: Promise<void> | null = null

/** Idempotent: injects the GIS script into the DOM, returns a promise that resolves when ready */
export function loadGIS(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise

  // If already loaded
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    gisLoadPromise = Promise.resolve()
    return gisLoadPromise
  }

  // If script tag already present
  const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)
  if (existing) {
    gisLoadPromise = new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GIS script failed to load')))
      // Already loaded check
      if (window.google?.accounts?.oauth2) resolve()
    })
    return gisLoadPromise
  }

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })

  return gisLoadPromise
}

// ─── Token Client ─────────────────────────────────────────────────────────────

let tokenClient: TokenClient | null = null

/** Initializes the GIS token client (must be called after loadGIS resolves) */
export function initTokenClient(
  clientId: string,
  callback: (response: { access_token?: string; error?: string }) => void,
): TokenClient {
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ].join(' '),
    callback,
  })
  return tokenClient
}

/** Request an access token — returns a Promise<string> */
export async function requestAccess(clientId: string): Promise<string> {
  await loadGIS()
  return new Promise((resolve, reject) => {
    const client = initTokenClient(clientId, (response) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error ?? 'Failed to get access token'))
      } else {
        storedToken = response.access_token
        resolve(response.access_token)
      }
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}

/** Revoke a Google OAuth access token */
export function revokeAccess(token: string): void {
  if (window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {})
  }
  storedToken = null
}

// ─── Gmail API ────────────────────────────────────────────────────────────────

export interface GmailProfile {
  emailAddress: string
  messagesTotal: number
}

/** Fetch the authenticated user's Gmail profile */
export async function getGmailProfile(token: string): Promise<GmailProfile> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail profile fetch failed: ${res.status}`)
  const data = await res.json()
  return {
    emailAddress: data.emailAddress ?? '',
    messagesTotal: data.messagesTotal ?? 0,
  }
}

export interface EmailSummary {
  id: string
  subject: string
  from: string
}

/** Fetch recent unread emails (up to 5), optionally newer than sinceMessageId */
export async function fetchNewEmails(
  token: string,
  sinceMessageId?: string,
): Promise<EmailSummary[]> {
  let query = 'is:unread'
  if (sinceMessageId) query += ` after:${sinceMessageId}`

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!listRes.ok) throw new Error(`Gmail list fetch failed: ${listRes.status}`)
  const listData = await listRes.json()

  if (!listData.messages || listData.messages.length === 0) return []

  const emails: EmailSummary[] = await Promise.all(
    listData.messages.map(async (msg: { id: string }) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!msgRes.ok) return { id: msg.id, subject: '(no subject)', from: '' }
        const msgData = await msgRes.json()
        const headers: { name: string; value: string }[] = msgData.payload?.headers ?? []
        const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)'
        const from = headers.find((h) => h.name === 'From')?.value ?? ''
        return { id: msg.id, subject, from }
      } catch {
        return { id: msg.id, subject: '(no subject)', from: '' }
      }
    }),
  )

  return emails
}

/** Start polling Gmail for new emails. Returns a stop function. */
export function startGmailPolling(
  token: string,
  onNewEmails: (emails: EmailSummary[]) => void,
  intervalMs: number = 60000,
): () => void {
  let lastSeenId: string | undefined

  const poll = async () => {
    try {
      const emails = await fetchNewEmails(token, lastSeenId)
      if (emails.length > 0) {
        // Track the first (newest) ID to avoid re-reporting
        if (!lastSeenId) {
          lastSeenId = emails[0].id
        } else {
          onNewEmails(emails)
          lastSeenId = emails[0].id
        }
      }
    } catch {
      // Non-fatal: token might have expired
    }
  }

  // Initial poll to set lastSeenId baseline (don't fire callback on first run)
  poll()

  const intervalId = setInterval(poll, intervalMs)
  return () => clearInterval(intervalId)
}

// ─── Google Drive API ─────────────────────────────────────────────────────────

/**
 * Upload a file blob to Google Drive via multipart upload.
 * Returns the Drive file ID.
 */
export async function uploadFileToDrive(
  token: string,
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const boundary = 'vcap2_drive_upload_boundary'
  const metadata = JSON.stringify({ name: fileName, mimeType })

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join('\r\n')

  // Build multipart body as ArrayBuffer
  const encoder = new TextEncoder()
  const preamble = encoder.encode(body)
  const fileData = await blob.arrayBuffer()
  const epilogue = encoder.encode(`\r\n--${boundary}--`)

  const combined = new Uint8Array(preamble.byteLength + fileData.byteLength + epilogue.byteLength)
  combined.set(preamble, 0)
  combined.set(new Uint8Array(fileData), preamble.byteLength)
  combined.set(epilogue, preamble.byteLength + fileData.byteLength)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Drive upload failed: ${res.status} ${errText}`)
  }

  const data = await res.json()
  return data.id as string
}

// ─── Firestore Persistence ────────────────────────────────────────────────────

const FM_CONFIG_COL = 'fm_config'
const USER_GOOGLE_PREFS_COL = 'user_google_prefs'

/** Save the Google Client ID to Firestore fm_config/google */
export async function saveClientId(clientId: string): Promise<void> {
  if (!db) throw new Error('Firestore not configured')
  await ensureAuth()
  await setDoc(doc(db, FM_CONFIG_COL, 'google'), { clientId }, { merge: true })
}

/** Load the Google Client ID from Firestore fm_config/google */
export async function loadClientId(): Promise<string> {
  if (!db) return ''
  await ensureAuth()
  const snap = await getDoc(doc(db, FM_CONFIG_COL, 'google'))
  if (!snap.exists()) return ''
  return (snap.data()?.clientId as string) ?? ''
}

export interface UserGooglePrefs {
  gmailEnabled: boolean
  driveEnabled: boolean
}

/** Save user Google preferences to Firestore */
export async function saveUserPref(userId: string, prefs: UserGooglePrefs): Promise<void> {
  if (!db) throw new Error('Firestore not configured')
  await ensureAuth()
  await setDoc(doc(db, USER_GOOGLE_PREFS_COL, userId), prefs, { merge: true })
}

/** Load user Google preferences from Firestore */
export async function loadUserPref(userId: string): Promise<UserGooglePrefs> {
  if (!db) return { gmailEnabled: false, driveEnabled: false }
  await ensureAuth()
  const snap = await getDoc(doc(db, USER_GOOGLE_PREFS_COL, userId))
  if (!snap.exists()) return { gmailEnabled: false, driveEnabled: false }
  const data = snap.data()
  return {
    gmailEnabled: Boolean(data?.gmailEnabled),
    driveEnabled: Boolean(data?.driveEnabled),
  }
}
