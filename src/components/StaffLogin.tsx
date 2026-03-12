import { useState, type FC, type FormEvent } from 'react'
import vcap2Logo from '../../assets/vcap2-logo.png'
import type { UserProfile } from '../types/user'
import { createUser, findUserByName } from '../services/userStore'
import app from '../config/firebase'

const STAFF_PASSWORD = 'VCAP2@2026'
const AUTHORIZED_NAME = 'Micky WELIN'

const useFirebase = !!app

interface StaffLoginProps {
  onSuccess: (user: UserProfile) => void
  onCancel: () => void
}

const StaffLogin: FC<StaffLoginProps> = ({ onSuccess, onCancel }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleFallbackLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    if (name.trim().toLowerCase() !== AUTHORIZED_NAME.toLowerCase()) {
      setError('Account not found')
      setName('')
      return
    }
    if (password !== STAFF_PASSWORD) {
      setError('Incorrect password')
      setPassword('')
      return
    }

    setLoading(true)
    try {
      let user = await findUserByName(AUTHORIZED_NAME)
      if (!user) {
        user = await createUser(AUTHORIZED_NAME, null)
      }
      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
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
      await updateLastLogin(user.id)
      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
      onSuccess(user)
    } catch (err: any) {
      console.error('Login error:', err)
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email')
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password')
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later')
      } else {
        setError('Login failed. Please check your credentials.')
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
      await updateLastLogin(user.id)
      sessionStorage.setItem('vcap2_staff_auth', '1')
      sessionStorage.setItem('vcap2_user_id', user.id)
      onSuccess(user)
    } catch (err: any) {
      console.error('Google login error:', err)
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled')
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up blocked. Please allow pop-ups for this site')
      } else {
        setError('Google sign-in failed. Please try again.')
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

  if (useFirebase) {
    return (
      <div className="login-container">
        {brandPanel}
        <div className="login-panel">
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

            <label className="login-label" htmlFor="staff-password">Password</label>
            <input
              id="staff-password"
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
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      {brandPanel}
      <div className="login-panel">
        <form className="login-form" onSubmit={handleFallbackLogin}>
          <h2>Staff Login</h2>
          <p className="login-description">
            Enter your name and the staff password to access the portal.
          </p>
          {error && <div className="login-error" role="alert">{error}</div>}

          <label className="login-label" htmlFor="staff-name">Name</label>
          <input
            id="staff-name"
            className="login-input"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="Enter your name"
            autoFocus
          />

          <label className="login-label" htmlFor="staff-password">Password</label>
          <input
            id="staff-password"
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Enter staff password"
          />

          <div className="login-actions">
            <button type="button" className="login-btn login-btn-secondary" onClick={onCancel}>
              Back to Public
            </button>
            <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
              Log In
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StaffLogin
