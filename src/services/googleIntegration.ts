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

export interface InboxEmail {
  id: string
  subject: string
  from: string
  date: string
}

export interface EmailDetail extends InboxEmail {
  body: string
  isHtml: boolean
}

// ─── Inbox helpers ────────────────────────────────────────────────────────────

/** Decode Base64url-encoded Gmail body data to a UTF-8 string */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
  } catch {
    return atob(base64)
  }
}

function findPartByMimeType(parts: { mimeType: string; body?: { data?: string }; parts?: unknown[] }[], mimeType: string): { body?: { data?: string } } | null {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part
    if (part.parts) {
      const found = findPartByMimeType(part.parts as typeof parts, mimeType)
      if (found) return found
    }
  }
  return null
}

function extractBody(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): { body: string; isHtml: boolean } {
  if (!payload) return { body: '', isHtml: false }
  // Simple (non-multipart) message
  if (payload.body?.data) {
    return { body: decodeBase64Url(payload.body.data), isHtml: payload.mimeType === 'text/html' }
  }
  // Multipart: prefer HTML, fall back to plain text
  if (payload.parts) {
    const parts = payload.parts as { mimeType: string; body?: { data?: string }; parts?: unknown[] }[]
    const html = findPartByMimeType(parts, 'text/html')
    if (html?.body?.data) return { body: decodeBase64Url(html.body.data), isHtml: true }
    const plain = findPartByMimeType(parts, 'text/plain')
    if (plain?.body?.data) return { body: decodeBase64Url(plain.body.data), isHtml: false }
  }
  return { body: '(No content)', isHtml: false }
}

/** Fetch all current unread emails for the inbox view (up to 50) */
export async function fetchAllUnreadEmails(token: string, maxResults = 50): Promise<InboxEmail[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread')}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)
  const listData = await listRes.json()
  if (!listData.messages?.length) return []

  const emails: InboxEmail[] = await Promise.all(
    listData.messages.map(async (msg: { id: string }) => {
      try {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) return { id: msg.id, subject: '(no subject)', from: '', date: '' }
        const data = await res.json()
        const headers: { name: string; value: string }[] = data.payload?.headers ?? []
        return {
          id: msg.id,
          subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
          from: headers.find((h) => h.name === 'From')?.value ?? '',
          date: headers.find((h) => h.name === 'Date')?.value ?? '',
        }
      } catch {
        return { id: msg.id, subject: '(no subject)', from: '', date: '' }
      }
    }),
  )
  return emails
}

/** Fetch full email content (subject, from, date, body) */
export async function fetchEmailDetail(token: string, id: string): Promise<EmailDetail> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Failed to fetch email: ${res.status}`)
  const data = await res.json()
  const headers: { name: string; value: string }[] = data.payload?.headers ?? []
  const { body, isHtml } = extractBody(data.payload)
  return {
    id,
    subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
    from: headers.find((h) => h.name === 'From')?.value ?? '',
    date: headers.find((h) => h.name === 'Date')?.value ?? '',
    body,
    isHtml,
  }
}

// ─── Portal dismiss tracking ──────────────────────────────────────────────────
// Tracks which emails the user has "read" in the portal.
// Does NOT affect Gmail — emails remain unread there.

const LS_DISMISSED = 'vcap2_gmail_portal_dismissed'

export function getDismissedEmails(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DISMISSED)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

export function dismissPortalEmail(id: string): void {
  const set = getDismissedEmails()
  set.add(id)
  localStorage.setItem(LS_DISMISSED, JSON.stringify([...set]))
}

/** Fetch recent unread emails (up to 10) */
export async function fetchNewEmails(token: string): Promise<EmailSummary[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread')}&maxResults=10`,
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

/** Start polling Gmail for new emails. Returns a stop function.
 *  Uses a Set of seen IDs: first poll establishes baseline (no notification),
 *  subsequent polls only fire onNewEmails for IDs not previously seen. */
export function startGmailPolling(
  token: string,
  onNewEmails: (emails: EmailSummary[]) => void,
  intervalMs: number = 60000,
): () => void {
  const seenIds = new Set<string>()
  let initialized = false

  const poll = async () => {
    try {
      const emails = await fetchNewEmails(token)
      if (!initialized) {
        // First run: record current unread IDs as baseline — don't notify
        emails.forEach((e) => seenIds.add(e.id))
        initialized = true
      } else {
        const fresh = emails.filter((e) => !seenIds.has(e.id))
        if (fresh.length > 0) {
          onNewEmails(fresh)
          fresh.forEach((e) => seenIds.add(e.id))
        }
      }
    } catch {
      // Non-fatal: token may have expired
    }
  }

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

// ─── Local Storage Persistence ───────────────────────────────────────────────
// localStorage is used as primary storage — no auth required, works instantly.
// Firestore sync is attempted in the background for cross-device sharing.

const LS_CLIENT_ID = 'vcap2_google_client_id'
const LS_USER_PREFS = 'vcap2_google_prefs'

const FM_CONFIG_COL = 'fm_config'
const USER_GOOGLE_PREFS_COL = 'user_google_prefs'

/** Save the Google Client ID — localStorage first, Firestore in background */
export async function saveClientId(clientId: string): Promise<void> {
  localStorage.setItem(LS_CLIENT_ID, clientId)
  // Background sync to Firestore (non-fatal if it fails)
  if (db) {
    ensureAuth().then(() =>
      setDoc(doc(db!, FM_CONFIG_COL, 'google'), { clientId }, { merge: true })
    ).catch(() => {})
  }
}

/** Load the Google Client ID — localStorage first, fall back to Firestore */
export async function loadClientId(): Promise<string> {
  const local = localStorage.getItem(LS_CLIENT_ID)
  if (local) return local
  // Try Firestore as fallback (e.g. first time on a new device)
  if (db) {
    try {
      await ensureAuth()
      const snap = await getDoc(doc(db, FM_CONFIG_COL, 'google'))
      if (snap.exists()) {
        const id = (snap.data()?.clientId as string) ?? ''
        if (id) localStorage.setItem(LS_CLIENT_ID, id)
        return id
      }
    } catch { /* non-fatal */ }
  }
  return ''
}

export interface UserGooglePrefs {
  gmailEnabled: boolean
  driveEnabled: boolean
}

/** Save user Google preferences — localStorage first, Firestore in background */
export async function saveUserPref(userId: string, prefs: UserGooglePrefs): Promise<void> {
  localStorage.setItem(`${LS_USER_PREFS}_${userId}`, JSON.stringify(prefs))
  if (db) {
    ensureAuth().then(() =>
      setDoc(doc(db!, USER_GOOGLE_PREFS_COL, userId), prefs, { merge: true })
    ).catch(() => {})
  }
}

/** Load user Google preferences — localStorage first, fall back to Firestore */
export async function loadUserPref(userId: string): Promise<UserGooglePrefs> {
  const local = localStorage.getItem(`${LS_USER_PREFS}_${userId}`)
  if (local) {
    try { return JSON.parse(local) as UserGooglePrefs } catch { /* ignore */ }
  }
  if (db) {
    try {
      await ensureAuth()
      const snap = await getDoc(doc(db, USER_GOOGLE_PREFS_COL, userId))
      if (snap.exists()) {
        const data = snap.data()
        return { gmailEnabled: Boolean(data?.gmailEnabled), driveEnabled: Boolean(data?.driveEnabled) }
      }
    } catch { /* non-fatal */ }
  }
  return { gmailEnabled: false, driveEnabled: false }
}
