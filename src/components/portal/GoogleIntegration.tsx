import { useState, useEffect, useCallback, type FC } from 'react'
import type { UserProfile } from '../../types/user'
import Icons8Icon from '../Icons8Icon'
import {
  loadGIS,
  requestAccess,
  revokeAccess,
  getGmailProfile,
  fetchAllUnreadEmails,
  fetchEmailDetail,
  dismissPortalEmail,
  getDismissedEmails,
  uploadFileToDrive,
  saveClientId,
  loadClientId,
  saveUserPref,
  loadUserPref,
  getStoredToken,
  setStoredToken,
  type GmailProfile,
  type InboxEmail,
  type EmailDetail,
} from '../../services/googleIntegration'
import './GoogleIntegration.css'

interface GoogleIntegrationProps {
  currentUser: UserProfile | null
  /** Called when Gmail polling should start (token + enabled) */
  onGmailReady?: (token: string, intervalMs: number) => void
  /** Called when Gmail polling should stop */
  onGmailStop?: () => void
}

type Tab = 'account' | 'gmail' | 'drive'

const POLL_OPTIONS = [
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
]

function formatEmailDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function parseSenderName(from: string): string {
  // "John Doe <john@example.com>" → "John Doe"
  const match = from.match(/^([^<]+)</)
  if (match) return match[1].trim()
  return from
}

const GoogleIntegration: FC<GoogleIntegrationProps> = ({
  currentUser,
  onGmailReady,
  onGmailStop,
}) => {
  const [tab, setTab] = useState<Tab>('account')

  // Account tab
  const [clientId, setClientId] = useState('')
  const [clientIdInput, setClientIdInput] = useState('')
  const [savingClientId, setSavingClientId] = useState(false)
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [gmailProfile, setGmailProfile] = useState<GmailProfile | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Gmail tab
  const [gmailEnabled, setGmailEnabled] = useState(false)
  const [pollInterval, setPollInterval] = useState(60000)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  // Inbox
  const [inboxEmails, setInboxEmails] = useState<InboxEmail[]>([])
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => getDismissedEmails())

  // Email detail modal
  const [openEmail, setOpenEmail] = useState<InboxEmail | null>(null)
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Drive tab
  const [driveEnabled, setDriveEnabled] = useState(false)

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Load saved client ID and user prefs on mount
  useEffect(() => {
    loadClientId().then((id) => {
      setClientId(id)
      setClientIdInput(id)
    })
    if (currentUser) {
      loadUserPref(currentUser.id).then((prefs) => {
        setGmailEnabled(prefs.gmailEnabled)
        setDriveEnabled(prefs.driveEnabled)
      })
    }
    const existing = getStoredToken()
    if (existing) {
      setToken(existing)
      getGmailProfile(existing).then(setGmailProfile).catch(() => {})
    }
  }, [currentUser])

  // Load inbox when Gmail tab is opened and token is available
  useEffect(() => {
    if (tab === 'gmail' && token) {
      loadInbox()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token])

  // Signal App.tsx to manage polling
  useEffect(() => {
    if (token && gmailEnabled) {
      onGmailReady?.(token, pollInterval)
      setLastChecked(new Date())
    } else {
      onGmailStop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, gmailEnabled, pollInterval])

  const loadInbox = useCallback(async () => {
    if (!token) return
    setLoadingInbox(true)
    try {
      const emails = await fetchAllUnreadEmails(token)
      const dismissed = getDismissedEmails()
      setDismissedIds(dismissed)
      setInboxEmails(emails.filter((e) => !dismissed.has(e.id)))
    } catch {
      // Non-fatal
    } finally {
      setLoadingInbox(false)
    }
  }, [token])

  async function handleOpenEmail(email: InboxEmail) {
    setOpenEmail(email)
    setEmailDetail(null)
    setLoadingDetail(true)
    try {
      const detail = await fetchEmailDetail(token!, email.id)
      setEmailDetail(detail)
    } catch {
      setEmailDetail({ ...email, body: '(Failed to load email content)', isHtml: false })
    } finally {
      setLoadingDetail(false)
    }
  }

  function handleCloseEmail() {
    if (openEmail) {
      dismissPortalEmail(openEmail.id)
      const newDismissed = getDismissedEmails()
      setDismissedIds(newDismissed)
      setInboxEmails((prev) => prev.filter((e) => e.id !== openEmail.id))
    }
    setOpenEmail(null)
    setEmailDetail(null)
  }

  function handleDismissEmail(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    dismissPortalEmail(id)
    setDismissedIds(getDismissedEmails())
    setInboxEmails((prev) => prev.filter((email) => email.id !== id))
  }

  function showAlert(type: 'success' | 'error', msg: string) {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 3500)
  }

  async function handleSaveClientId() {
    if (!clientIdInput.trim()) return
    setSavingClientId(true)
    try {
      await saveClientId(clientIdInput.trim())
      setClientId(clientIdInput.trim())
      showAlert('success', 'Client ID saved')
      await loadGIS()
    } catch (err) {
      showAlert('error', `Failed to save Client ID: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSavingClientId(false)
    }
  }

  async function handleConnect() {
    if (!clientId) {
      showAlert('error', 'Enter and save a Google Client ID first (Step 3)')
      return
    }
    setConnecting(true)
    try {
      const accessToken = await requestAccess(clientId)
      setStoredToken(accessToken)
      setToken(accessToken)
      try {
        const profile = await getGmailProfile(accessToken)
        setGmailProfile(profile)
        showAlert('success', `Connected as ${profile.emailAddress}`)
      } catch {
        showAlert('success', 'Google account connected. Enable Gmail API to see your email address.')
      }
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  function handleDisconnect() {
    if (token) revokeAccess(token)
    setStoredToken(null)
    setToken(null)
    setGmailProfile(null)
    setInboxEmails([])
    onGmailStop?.()
    showAlert('success', 'Google account disconnected')
  }

  async function handleToggleGmail(enabled: boolean) {
    setGmailEnabled(enabled)
    if (currentUser) {
      await saveUserPref(currentUser.id, { gmailEnabled: enabled, driveEnabled })
    }
  }

  async function handleToggleDrive(enabled: boolean) {
    setDriveEnabled(enabled)
    if (currentUser) {
      await saveUserPref(currentUser.id, { gmailEnabled, driveEnabled: enabled })
    }
  }

  async function handleTestDriveUpload() {
    if (!token) return
    try {
      const blob = new Blob(['VCAP2 Drive test upload'], { type: 'text/plain' })
      const id = await uploadFileToDrive(token, blob, 'vcap2-test.txt', 'text/plain')
      showAlert('success', `Test file uploaded to Drive (ID: ${id})`)
    } catch (err) {
      showAlert('error', err instanceof Error ? err.message : 'Drive upload failed')
    }
  }

  if (!currentUser) return null

  return (
    <div className="gi-page">
      {alert && (
        <div className={`gi-alert gi-alert-${alert.type}`}>{alert.msg}</div>
      )}

      {/* Tabs */}
      <div className="gi-tabs">
        <button
          className={`gi-tab ${tab === 'account' ? 'gi-tab-active' : ''}`}
          onClick={() => setTab('account')}
        >
          <Icons8Icon name="google-logo" size={16} /> Google Account
        </button>
        <button
          className={`gi-tab ${tab === 'gmail' ? 'gi-tab-active' : ''}`}
          onClick={() => setTab('gmail')}
        >
          <Icons8Icon name="email" size={16} /> Gmail
          {inboxEmails.length > 0 && (
            <span className="gi-inbox-badge">{inboxEmails.length}</span>
          )}
        </button>
        <button
          className={`gi-tab ${tab === 'drive' ? 'gi-tab-active' : ''}`}
          onClick={() => setTab('drive')}
        >
          <Icons8Icon name="google-drive" size={16} /> Google Drive
        </button>
      </div>

      {/* ══ Account Tab ══ */}
      {tab === 'account' && (
        <div className="gi-tab-content">
          <p className="gi-steps-title">One-time setup (admin configures once for all users)</p>
          <div className="gi-steps">
            <div className="gi-step">
              <span className="gi-step-num">1</span>
              <span className="gi-step-text">
                Go to <strong>console.cloud.google.com</strong> → APIs &amp; Services → Credentials →
                Create OAuth 2.0 Client ID (type: <em>Web Application</em>). Under
                "Authorized JavaScript Origins" add your portal's domain (e.g.{' '}
                <code>https://welinrj.github.io</code>).
              </span>
            </div>
            <div className="gi-step">
              <span className="gi-step-num">2</span>
              <span className="gi-step-text">
                Enable the <strong>Gmail API</strong> and <strong>Google Drive API</strong> in your
                Google Cloud project under APIs &amp; Services → Library.
              </span>
            </div>
            <div className="gi-step">
              <span className="gi-step-num">3</span>
              <span className="gi-step-text">
                Copy your <strong>Client ID</strong> (ends in <code>.apps.googleusercontent.com</code>)
                and paste it below, then click Save.
              </span>
            </div>
          </div>

          <div className="gi-client-id-section">
            <label className="gi-label">Google Client ID</label>
            <div className="gi-input-row">
              <input
                className="gi-input"
                placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
              />
              <button
                className="gi-btn gi-btn-primary"
                onClick={handleSaveClientId}
                disabled={savingClientId || !clientIdInput.trim()}
              >
                {savingClientId ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {token && gmailProfile ? (
            <div className="gi-account-card">
              <div className="gi-account-avatar">
                {gmailProfile.emailAddress.charAt(0).toUpperCase()}
              </div>
              <div className="gi-account-info">
                <span className="gi-account-email">{gmailProfile.emailAddress}</span>
                <span className="gi-account-sub">
                  <span className="gi-status-badge gi-status-connected">
                    <span className="gi-status-dot" /> Connected
                  </span>
                  &nbsp;· {gmailProfile.messagesTotal.toLocaleString()} total messages
                </span>
              </div>
              <button className="gi-btn gi-btn-danger" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <div className="gi-connect-section">
              <span className="gi-status-badge gi-status-disconnected">
                <span className="gi-status-dot" /> Not connected
              </span>
              <button
                className="gi-btn gi-btn-google"
                onClick={handleConnect}
                disabled={connecting || !clientId}
              >
                <Icons8Icon name="google-logo" size={18} />
                {connecting ? 'Connecting…' : 'Connect Google Account'}
              </button>
              {!clientId && (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  Save a Client ID first (Step 3 above)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Gmail Tab ══ */}
      {tab === 'gmail' && (
        <div className="gi-tab-content">
          {!token ? (
            <div className="gi-not-connected">
              <Icons8Icon name="email" size={40} />
              <span>Connect your Google Account first (Account tab)</span>
            </div>
          ) : (
            <>
              {/* Notification toggle */}
              <div className="gi-toggle-row">
                <div className="gi-toggle-label">
                  <span className="gi-toggle-label-text">Email notifications</span>
                  <span className="gi-toggle-label-sub">
                    Get a portal notification when new emails arrive in your Gmail
                  </span>
                </div>
                <label className="gi-toggle">
                  <input
                    type="checkbox"
                    checked={gmailEnabled}
                    onChange={(e) => handleToggleGmail(e.target.checked)}
                  />
                  <span className="gi-toggle-slider" />
                </label>
              </div>

              {gmailEnabled && (
                <div className="gi-select-row">
                  <span className="gi-select-label">Check every</span>
                  <select
                    className="gi-select"
                    value={pollInterval}
                    onChange={(e) => setPollInterval(Number(e.target.value))}
                  >
                    {POLL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="gi-info-row-muted" style={{ fontSize: '0.8125rem' }}>
                    Last checked: {lastChecked ? lastChecked.toLocaleTimeString() : 'Waiting…'}
                  </span>
                </div>
              )}

              {/* Inbox */}
              <div className="gi-inbox-header">
                <span className="gi-inbox-title">
                  Unread inbox
                  {inboxEmails.length > 0 && (
                    <span className="gi-inbox-count">{inboxEmails.length}</span>
                  )}
                </span>
                <button
                  className="gi-btn gi-btn-secondary gi-btn-sm"
                  onClick={loadInbox}
                  disabled={loadingInbox}
                >
                  <Icons8Icon name="refresh" size={13} />
                  {loadingInbox ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {loadingInbox ? (
                <div className="gi-inbox-loading">Loading emails…</div>
              ) : inboxEmails.length === 0 ? (
                <div className="gi-inbox-empty">
                  <Icons8Icon name="email" size={32} />
                  <span>No unread emails</span>
                </div>
              ) : (
                <div className="gi-inbox-list">
                  {inboxEmails.map((email) => (
                    <button
                      key={email.id}
                      className="gi-inbox-row"
                      onClick={() => handleOpenEmail(email)}
                    >
                      <div className="gi-inbox-avatar">
                        {parseSenderName(email.from).charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="gi-inbox-meta">
                        <span className="gi-inbox-from">{parseSenderName(email.from)}</span>
                        <span className="gi-inbox-subject">{email.subject}</span>
                      </div>
                      <div className="gi-inbox-right">
                        <span className="gi-inbox-date">{formatEmailDate(email.date)}</span>
                        <button
                          className="gi-inbox-dismiss"
                          title="Dismiss from portal"
                          onClick={(e) => handleDismissEmail(email.id, e)}
                        >
                          ×
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ Drive Tab ══ */}
      {tab === 'drive' && (
        <div className="gi-tab-content">
          {!token ? (
            <div className="gi-not-connected">
              <Icons8Icon name="google-drive" size={40} />
              <span>Connect your Google Account first (Account tab)</span>
            </div>
          ) : (
            <>
              <div className="gi-toggle-row">
                <div className="gi-toggle-label">
                  <span className="gi-toggle-label-text">Enable Drive integration</span>
                  <span className="gi-toggle-label-sub">
                    Adds a "Save to Drive" button on every file in the File Manager
                  </span>
                </div>
                <label className="gi-toggle">
                  <input
                    type="checkbox"
                    checked={driveEnabled}
                    onChange={(e) => handleToggleDrive(e.target.checked)}
                  />
                  <span className="gi-toggle-slider" />
                </label>
              </div>

              {driveEnabled && (
                <>
                  <div className="gi-drive-info">
                    <strong>Drive integration active.</strong> A <em>Save to Drive</em> button will
                    appear on files in the File Manager.
                    <div className="gi-drive-note">
                      Files are uploaded to the root of your Google Drive
                      ({gmailProfile?.emailAddress}).
                    </div>
                  </div>
                  <button className="gi-btn gi-btn-secondary" onClick={handleTestDriveUpload}>
                    <Icons8Icon name="upload" size={14} /> Test Drive Upload
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ Email Detail Modal ══ */}
      {openEmail && (
        <div className="gi-modal-overlay" onClick={handleCloseEmail}>
          <div className="gi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gi-modal-header">
              <div className="gi-modal-meta">
                <span className="gi-modal-subject">{openEmail.subject}</span>
                <span className="gi-modal-from">
                  <strong>From:</strong> {openEmail.from}
                </span>
                {openEmail.date && (
                  <span className="gi-modal-date">
                    <strong>Date:</strong> {new Date(openEmail.date).toLocaleString()}
                  </span>
                )}
              </div>
              <button className="gi-modal-close" onClick={handleCloseEmail} title="Close (marks as read in portal)">
                ×
              </button>
            </div>
            <div className="gi-modal-body">
              {loadingDetail ? (
                <div className="gi-modal-loading">Loading email…</div>
              ) : emailDetail?.isHtml ? (
                <iframe
                  className="gi-modal-iframe"
                  sandbox="allow-same-origin"
                  srcDoc={emailDetail.body}
                  title="Email content"
                />
              ) : (
                <pre className="gi-modal-text">{emailDetail?.body ?? ''}</pre>
              )}
            </div>
            <div className="gi-modal-footer">
              <span className="gi-modal-footer-note">
                Closing this email removes it from the portal inbox. It stays unread in Gmail.
              </span>
              <button className="gi-btn gi-btn-primary" onClick={handleCloseEmail}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleIntegration
