import { useState, type FC, type FormEvent } from 'react'
import vcap2Logo from '../../assets/vcap2-logo.png'
import type { UserProfile } from '../types/user'
import { findUserByName } from '../services/userStore'
import { WavyBackground } from './ui/wavy-background'

const STAFF_PASSWORD = 'VCAP2@2026'
const STAFF_USER_NAME = 'VCAP2 Staff'

interface StaffLoginProps {
  onSuccess: (user: UserProfile) => void
  onCancel: () => void
}

type Mode = 'email' | 'staff'

const StaffLogin: FC<StaffLoginProps> = ({ onSuccess, onCancel }) => {
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const persist = (user: UserProfile) => {
    sessionStorage.setItem('vcap2_staff_auth', '1')
    sessionStorage.setItem('vcap2_user_id', user.id)
    sessionStorage.setItem('vcap2_user_profile', JSON.stringify(user))
    onSuccess(user)
  }

  // ── Email / password login (individual accounts) ──────────────────────────
  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email'); return }
    if (!password)     { setError('Please enter your password'); return }
    setLoading(true)
    try {
      const { signInWithEmail, updateLastLogin } = await import('../services/firebaseAuth')
      const user = await signInWithEmail(email.trim(), password)
      updateLastLogin(user.id).catch(() => {})
      persist(user)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' ||
          code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        setError('Incorrect email or password')
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else if (code === 'auth/user-disabled') {
        setError('This account has been disabled')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.')
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your connection and try again.')
      } else {
        setError('Login failed. Please try again.')
      }
      setLoading(false)
    }
  }

  // ── Google login ──────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const { signInWithGoogle, updateLastLogin } = await import('../services/firebaseAuth')
      const user = await signInWithGoogle()
      updateLastLogin(user.id).catch(() => {})
      persist(user)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('')
      } else if (code === 'auth/popup-blocked') {
        setError('Pop-up blocked. Please allow pop-ups for this site and try again.')
      } else {
        setError('Google sign-in failed. Please try again.')
      }
      setLoading(false)
    }
  }

  // ── Staff (shared) password login ─────────────────────────────────────────
  const handleStaffLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== STAFF_PASSWORD) {
      setError('Incorrect staff password')
      setPassword('')
      return
    }
    setLoading(true)
    try {
      // Sign in anonymously for Firebase session, then write a user doc at the
      // anonymous Firebase UID so Firestore security rules can resolve the role.
      try {
        const { signInAnonymously } = await import('firebase/auth')
        const { auth, db } = await import('../config/firebase')
        const anonResult = await signInAnonymously(auth)
        try {
          const { doc: fsDoc, setDoc: fsSetDoc, serverTimestamp: fsST } = await import('firebase/firestore')
          await fsSetDoc(fsDoc(db, 'users', anonResult.user.uid), {
            role: 'admin',
            name: STAFF_USER_NAME,
            updatedAt: fsST(),
          }, { merge: true })
        } catch { /* non-fatal — Firestore may not be reachable yet */ }
      } catch { /* non-fatal */ }

      let user: UserProfile | null = null
      try {
        const { db } = await import('../config/firebase')
        const { collection, query, where, getDocs, doc, setDoc, serverTimestamp } = await import('firebase/firestore')
        const q = query(collection(db, 'users'), where('name', '==', STAFF_USER_NAME))
        const snap = await getDocs(q)
        const existing = snap.docs.find((d) => !d.data()._deleted)
        if (existing) {
          const data = existing.data()
          user = {
            id: existing.id,
            name: data.name ?? STAFF_USER_NAME,
            role: 'admin',
            email: data.email,
            organization: data.organization,
            avatar: data.avatar,
            createdAt: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
          }
          if (data.role !== 'admin') {
            await setDoc(doc(db, 'users', existing.id), { role: 'admin' }, { merge: true })
          }
        } else {
          const stableId = 'vcap2_staff_admin'
          user = { id: stableId, name: STAFF_USER_NAME, role: 'admin', createdAt: new Date().toISOString() }
          await setDoc(doc(db, 'users', stableId), { ...user, createdAt: serverTimestamp(), lastLogin: serverTimestamp() })
        }
      } catch {
        try { user = await findUserByName(STAFF_USER_NAME) } catch { /* ignore */ }
        if (!user) {
          user = { id: 'vcap2_staff', name: STAFF_USER_NAME, role: 'admin', createdAt: new Date().toISOString() }
        } else if (user.role !== 'admin') {
          user = { ...user, role: 'admin' }
        }
      }
      persist(user)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setEmail('')
    setPassword('')
    setLoading(false)
  }

  return (
    <WavyBackground
      colors={['#22c55e', '#06b6d4', '#3b82f6', '#4ade80', '#0891b2']}
      backgroundFill="#0c1520"
      blur={5}
      speed="slow"
      waveOpacity={0.85}
      containerClassName="!h-auto min-h-screen"
      className="w-full"
    >
      <div className="login-container">
        <div className="login-brand">
          <img src={vcap2Logo} alt="VCAP2" />
          <h1>VCAP2 Staff Portal</h1>
          <p>Adaptation to Climate Change in the Coastal Zone of Vanuatu Phase II</p>
        </div>

        <div className="login-panel">
          {mode === 'email' ? (
            <form className="login-form" onSubmit={handleEmailLogin}>
              <h2>Staff Login</h2>
              <p className="login-description">Sign in with your email and password.</p>

              {error && <div className="login-error" role="alert">{error}</div>}

              <label className="login-label" htmlFor="staff-email">Email</label>
              <input
                id="staff-email"
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="your.email@example.com"
                autoFocus
                disabled={loading}
              />

              <label className="login-label" htmlFor="staff-pw">Password</label>
              <input
                id="staff-pw"
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="Enter your password"
                disabled={loading}
              />

              <div className="login-actions">
                <button type="button" className="login-btn login-btn-secondary" onClick={onCancel} disabled={loading}>
                  Back to Public
                </button>
                <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
                  {loading ? 'Signing in…' : 'Log In'}
                </button>
              </div>

              <div className="login-divider"><span>OR</span></div>

              <button
                type="button"
                className="login-btn login-btn-google"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
                  <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
                </svg>
                {loading ? 'Signing in…' : 'Continue with Google'}
              </button>

              <button type="button" className="login-mode-toggle" onClick={() => switchMode('staff')}>
                Use shared staff password instead
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleStaffLogin}>
              <h2>Staff Login</h2>
              <p className="login-description">Enter the shared staff password to access the portal.</p>

              {error && <div className="login-error" role="alert">{error}</div>}

              <label className="login-label" htmlFor="shared-pw">Staff Password</label>
              <input
                id="shared-pw"
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="Enter staff password"
                autoFocus
                disabled={loading}
              />

              <div className="login-actions">
                <button type="button" className="login-btn login-btn-secondary" onClick={onCancel} disabled={loading}>
                  Back to Public
                </button>
                <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
                  {loading ? 'Signing in…' : 'Log In'}
                </button>
              </div>

              <button type="button" className="login-mode-toggle" onClick={() => switchMode('email')}>
                Sign in with your own account instead
              </button>
            </form>
          )}
        </div>
      </div>
    </WavyBackground>
  )
}

export default StaffLogin
