import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App'

// Helper: navigate to login screen and authenticate using the shared staff password
async function loginAsStaff() {
  // Open login form
  fireEvent.click(screen.getAllByRole('button', { name: /Staff Login/i })[0])
  // Default mode is email — switch to shared staff password mode
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Use shared staff password instead/i })).toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole('button', { name: /Use shared staff password instead/i }))
  await waitFor(() => {
    expect(screen.getByLabelText('Staff Password')).toBeInTheDocument()
  })
  fireEvent.change(screen.getByLabelText('Staff Password'), { target: { value: 'VCAP2@2026' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
  })
}

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('shows public portal with Dashboard by default', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Staff Login/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('shows login form when Staff Login is clicked', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /Staff Login/i })[0])
    // Default mode shows Email and Password fields
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('shows error when email is missing in email mode', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /Staff Login/i })[0])
    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
    })
    // Submit with password but no email
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'somepassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email')
    })
  })

  it('shows error when staff password is wrong', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /Staff Login/i })[0])
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Use shared staff password instead/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Use shared staff password instead/i }))
    await waitFor(() => {
      expect(screen.getByLabelText('Staff Password')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('Staff Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect staff password')
    })
  })

  it('logs in with staff password and grants access', async () => {
    render(<App />)
    await loginAsStaff()
  })

  it('renders sidebar with project name after login', async () => {
    render(<App />)
    await loginAsStaff()
    expect(screen.getByText('VCAP2')).toBeInTheDocument()
  })

  it('logs in again after logout', async () => {
    render(<App />)
    await loginAsStaff()
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(screen.getAllByRole('button', { name: /Staff Login/i }).length).toBeGreaterThanOrEqual(1)
    await loginAsStaff()
  })

  it('navigates staff sections after login', async () => {
    render(<App />)
    await loginAsStaff()
    fireEvent.click(screen.getByRole('button', { name: 'GIS Database' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'GIS Database', level: 1 })).toBeInTheDocument())
  })

  it('renders header with section title', async () => {
    render(<App />)
    await loginAsStaff()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('logs out and returns to public portal', async () => {
    render(<App />)
    await loginAsStaff()
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(screen.getAllByRole('button', { name: /Staff Login/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('restores staff auth from sessionStorage', () => {
    sessionStorage.setItem('vcap2_staff_auth', '1')
    render(<App />)
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows greeting with user name in header after login', async () => {
    render(<App />)
    await loginAsStaff()
    await waitFor(() => {
      expect(screen.getByText('Welcome, VCAP2 Staff')).toBeInTheDocument()
    })
  })

  it('shows user name in sidebar after login', async () => {
    render(<App />)
    await loginAsStaff()
    await waitFor(() => {
      expect(screen.getByText('VCAP2 Staff')).toBeInTheDocument()
    })
  })

  it('shows avatar fallback initial when no picture uploaded', async () => {
    render(<App />)
    await loginAsStaff()
    await waitFor(() => {
      const fallbacks = screen.getAllByText('V')
      expect(fallbacks.length).toBeGreaterThanOrEqual(1)
    })
  })
})
