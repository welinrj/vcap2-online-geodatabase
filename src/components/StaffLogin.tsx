import { useState, type FC, type FormEvent } from 'react'
import vcap2Logo from '../../assets/vcap2-logo.png'
import type { UserProfile } from '../types/user'
import { findUserByName } from '../services/userStore'
import app from '../config/firebase'
import { WavyBackground } from './ui/wavy-background'

const STAFF_PASSWORD = 'VCAP2@2026'
const STAFF_USER_NAME = 'VCAP2 Staff'

const useFirebase = !!app

interface StaffLoginProps {
  onSuccess: (user: UserProfile) => void
  onCancel: () => void
}

const StaffLogin: FC<StaffLoginProps> = ({ onSuccess, onCancel }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [staffPassword, setStaffPassword] = useState('')
  const [loginMode, setLoginMode] = useState<'firebase' | 'staff'>('staff')
  const [showSignUp, setShowSignUp] = useState(false)

  const handleFallbackLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== STAFF_PASSWORD) {
      setError('Incorrect password')
      setPassword('')
      return
    }

    setLoading(true)
    try {
      let user: UserProfile | null = null

      // Sign in anonymously for Firebase Auth session (Storage/Firestore rules).
      // IMPORTANT: do NOT use the anonymous UID as the portal user ID — it changes
      // every session. Instead look up the user by name for a stable ID.
      try {
        const { signInAnonymously } = await import('firebase/auth')
        const { auth } = await import('../config/firebase')
        await signInAnonymously(auth)
      } catch {
        // Non-fatal: auth will be retried by ensureAuth() in store functions
      }

      // Look up existing user by name to get a stable, persistent portal ID
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
          // First-ever staff login — create with a stable fixed ID
          const stableId = 'vcap2_staff_admin'
          user = {
            id: stableId,
            name: STAFF_USER_NAME,
            role: 'admin',
            createdAt: new Date().toISOString(),
          }
          await setDoc(doc(db, 'users', stableId), {
            ...user,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          })
        }
      } catch {
        // Firestore unavailable — fall back to local profile
        try { user = await findUserByName(STAFF_USER_NAME) } catch { /* ignore */ }
        if (!user) {
          user = { id: 'vcap2_staff', name: STAFF_USER_NAME, role: 'admin', createdAt: new Date().toISOString() }
        } else if (user.role !== 'admin') {
          user = { ...user, role: 'admin' }
        }
      }

      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
      sessionStorage.setItem('vcap2_user_profile', JSON.stringify(user))
      onSuccess(user)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const handleFirebaseLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }
    if (!password) {
      setError('Please enter your password')
      return
    }

    setLoading(true)
    try {
      const { signInWithEmail, updateLastLogin } = await import('../services/firebaseAuth')
      const user = await signInWithEmail(email, password)
      updateLastLogin(user.id).catch(() => {})
      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
      sessionStorage.setItem('vcap2_user_profile', JSON.stringify(user))
      onSuccess(user)
    } catch (err: unknown) {
      console.error('Firebase login error:', err)
      const code = (err as { code?: string }).code
      if (code === 'auth/user-not-found') {
        setError('No account found with this email')
      } else if (code === 'auth/wrong-password') {
        setError('Incorrect password')
      } else if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        setError('Invalid email or password')
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else if (code === 'auth/user-disabled') {
        setError('This account has been disabled')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later')
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email/password sign-in is not enabled. Use the staff password instead.')
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection and try again.')
      } else if (code === 'auth/configuration-not-found') {
        setError('Firebase authentication is not configured. Use the staff password instead.')
      } else {
        setError(`Login failed${code ? ` (${code})` : ''}. Try using the staff password instead.`)
      }
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const { signInWithGoogle, updateLastLogin } = await import('../services/firebaseAuth')
      const user = await signInWithGoogle()
      updateLastLogin(user.id).catch(() => {})
      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
      sessionStorage.setItem('vcap2_user_profile', JSON.stringify(user))
      onSuccess(user)
    } catch (err: unknown) {
      console.error('Google login error:', err)
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled')
      } else if (code === 'auth/popup-blocked') {
        setError('Pop-up blocked. Please allow pop-ups for this site')
      } else if (code === 'auth/operation-not-allowed') {
        setError('Google sign-in is not enabled. Use the staff password instead.')
      } else {
        setError(`Google sign-in failed${code ? ` (${code})` : ''}. Try using the staff password instead.`)
      }
      setLoading(false)
    }
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    if (staffPassword !== STAFF_PASSWORD) {
      setError('Incorrect staff password. You need the staff password to create an account.')
      setStaffPassword('')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { createUser: createFirebaseUser, updateLastLogin } = await import('../services/firebaseAuth')
      const user = await createFirebaseUser(email, password, {
        name: email.split('@')[0],
        role: 'admin',
        organization: '',
      })
      updateLastLogin(user.id).catch(() => {})
      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
      sessionStorage.setItem('vcap2_user_profile', JSON.stringify(user))
      onSuccess(user)
    } catch (err: unknown) {
      console.error('Sign-up error:', err)
      const code = (err as { code?: string }).code
      if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try signing in instead.')
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.')
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else {
        setError('Account creation failed. Please try again.')
      }
      setLoading(false)
    }
  }

  const brandPanel = (
    <div className="login-brand">
      <img src={vcap2Logo} alt="VCAP2" />
      <h1>VCAP2 Staff Portal</h1>
      <p>Adaptation to Climate Change in the Coastal Zone of Vanuatu Phase II</p>
    </div>
  )

  const switchMode = () => {
    setError('')
    setPassword('')
    setEmail('')
    setStaffPassword('')
    setShowSignUp(false)
    setLoginMode(loginMode === 'firebase' ? 'staff' : 'firebase')
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
      {brandPanel}
      <div className="login-panel">
        {loginMode === 'firebase' && !showSignUp ? (
          <form className="login-form" onSubmit={handleFirebaseLogin}>
            <h2>Staff Login</h2>
            <p className="login-description">
              Sign in with your email and password or use Google.
            </p>
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
            />

            <label className="login-label" htmlFor="staff-password-firebase">Password</label>
            <input
              id="staff-password-firebase"
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter your password"
            />

            <div className="login-actions">
              <button type="button" className="login-btn login-btn-secondary" onClick={onCancel}>
                Back to Public
              </button>
              <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
                {loading ? 'Signing in...' : 'Log In'}
              </button>
            </div>

            <div className="login-divider">
              <span>OR</span>
            </div>

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
              {loading ? 'Signing in...' : 'Continue with Google'}
            </button>

            <button
              type="button"
              className="login-mode-toggle"
              onClick={() => { setError(''); setShowSignUp(true) }}
            >
              Create new account
            </button>

            <button
              type="button"
              className="login-mode-toggle"
              onClick={switchMode}
            >
              Use staff password instead
            </button>
          </form>
        ) : loginMode === 'firebase' && showSignUp ? (
          <form className="login-form" onSubmit={handleSignUp}>
            <h2>Create Account</h2>
            <p className="login-description">
              Enter the staff password and your new account details.
            </p>
            {error && <div className="login-error" role="alert">{error}</div>}

            <label className="login-label" htmlFor="signup-staff-pw">Staff Password</label>
            <input
              id="signup-staff-pw"
              className="login-input"
              type="password"
              value={staffPassword}
              onChange={(e) => { setStaffPassword(e.target.value); setError('') }}
              placeholder="Enter staff password to verify"
              autoFocus
            />

            <label className="login-label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              placeholder="your.email@example.com"
            />

            <label className="login-label" htmlFor="signup-password">New Password</label>
            <input
              id="signup-password"
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="At least 6 characters"
            />

            <div className="login-actions">
              <button type="button" className="login-btn login-btn-secondary" onClick={() => { setShowSignUp(false); setError(''); setStaffPassword('') }}>
                Back to Login
              </button>
              <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleFallbackLogin}>
            <h2>Staff Login</h2>
            <p className="login-description">
              Enter the staff password to access the portal.
            </p>
            {error && <div className="login-error" role="alert">{error}</div>}

            <label className="login-label" htmlFor="staff-password">Password</label>
            <input
              id="staff-password"
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter staff password"
              autoFocus
            />

            <div className="login-actions">
              <button type="button" className="login-btn login-btn-secondary" onClick={onCancel}>
                Back to Public
              </button>
              <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
                {loading ? 'Signing in...' : 'Log In'}
              </button>
            </div>

            {useFirebase && (
              <button
                type="button"
                className="login-mode-toggle"
                onClick={switchMode}
              >
                Sign in with email or Google instead
              </button>
            )}
          </form>
        )}
      </div>
    </div>
    </WavyBackground>
  )
}

export default StaffLogin
