import { useState, useEffect, type FC } from 'react'
import type { UserProfile } from '../../types/user'
import Icons8Icon from '../Icons8Icon'
import {
  loadGIS,
  requestAccess,
  revokeAccess,
  getGmailProfile,
  uploadFileToDrive,
  saveClientId,
  loadClientId,
  saveUserPref,
  loadUserPref,
  getStoredToken,
  setStoredToken,
  type GmailProfile,
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
    // Restore token from module state
    const existing = getStoredToken()
    if (existing) {
      setToken(existing)
      getGmailProfile(existing).then(setGmailProfile).catch(() => {})
    }
  }, [currentUser])

  // Manage Gmail polling when token + enabled changes.
  // App.tsx owns the polling loop (creates notifications); we just signal it.
  useEffect(() => {
    if (token && gmailEnabled) {
      onGmailReady?.(token, pollInterval)
      setLastChecked(new Date())
    } else {
      onGmailStop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, gmailEnabled, pollInterval])

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
      // Pre-load GIS so the connect button is faster
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
      // Gmail profile fetch is non-fatal — may fail if Gmail API not yet enabled
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

          {/* Connection status */}
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
                <>
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
                  </div>

                  <div className="gi-info-row">
                    <Icons8Icon name="email" size={16} />
                    <span>Connected as <strong>{gmailProfile?.emailAddress}</strong></span>
                    {gmailProfile && (
                      <span className="gi-info-row-muted">
                        · {gmailProfile.messagesTotal.toLocaleString()} total messages
                      </span>
                    )}
                  </div>

                  <div className="gi-info-row gi-info-row-muted">
                    <Icons8Icon name="clock" size={14} />
                    Last checked:{' '}
                    {lastChecked ? lastChecked.toLocaleTimeString() : 'Waiting for first check…'}
                  </div>
                </>
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

                  <button
                    className="gi-btn gi-btn-secondary"
                    onClick={handleTestDriveUpload}
                  >
                    <Icons8Icon name="upload" size={14} /> Test Drive Upload
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default GoogleIntegration
