import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App'

// Helper: log in with the staff password and land on the staff portal
async function loginAsStaff() {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'VCAP2@2026' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
  })
}

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('shows login form when not authenticated', () => {
    render(<App />)
    expect(screen.getByText('Staff Login')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('shows error for wrong password', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password')
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

    // Log out
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(screen.getByText('Staff Login')).toBeInTheDocument()

    // Log back in
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

  it('logs out and returns to login', async () => {
    render(<App />)
    await loginAsStaff()
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(screen.getByText('Staff Login')).toBeInTheDocument()
  })

  it('restores staff auth from sessionStorage', () => {
    sessionStorage.setItem('vcap2_staff_auth', '1')
    render(<App />)
    // Should go straight to staff Dashboard without login
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
