import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App'

// Helper: log in with the staff password and land on the staff portal
async function loginAsStaff() {
  fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'VCAP2@2026' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'GIS Database' })).toBeInTheDocument()
  })
}

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('renders sidebar with project name and page switcher', () => {
    render(<App />)
    expect(screen.getByText('VCAP2')).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
    expect(screen.getByText('Public')).toBeInTheDocument()
  })

  it('defaults to public page with datasets', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Datasets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument()
  })

  it('shows login form when clicking Staff without auth', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    expect(screen.getByText('Staff Login')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('shows error for wrong password', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password')
  })

  it('logs in with staff password and grants access', async () => {
    render(<App />)
    await loginAsStaff()
  })

  it('logs in again after logout', async () => {
    render(<App />)
    await loginAsStaff()

    // Log out
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(screen.getByRole('button', { name: 'Datasets' })).toBeInTheDocument()

    // Log back in
    await loginAsStaff()
  })

  it('returns to public page when cancelling login', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Public' }))
    expect(screen.getByRole('button', { name: 'Datasets' })).toBeInTheDocument()
  })

  it('navigates staff sections after login', async () => {
    render(<App />)
    await loginAsStaff()
    fireEvent.click(screen.getByRole('button', { name: 'GIS Database' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'GIS Database', level: 1 })).toBeInTheDocument())
  })

  it('renders header with section title', () => {
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('switches to public page and shows about section', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(screen.getByText('VCAP2 Public Data Portal')).toBeInTheDocument()
  })

  it('logs out and returns to public page', async () => {
    render(<App />)
    await loginAsStaff()
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(screen.getByRole('button', { name: 'Datasets' })).toBeInTheDocument()
  })

  it('restores staff auth from sessionStorage', () => {
    sessionStorage.setItem('vcap2_staff_auth', '1')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    // Should go straight to staff GIS Database without login
    expect(screen.getByRole('button', { name: 'GIS Database' })).toBeInTheDocument()
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
