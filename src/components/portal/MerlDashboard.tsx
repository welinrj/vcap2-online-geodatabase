import { lazy, Suspense, useState, useEffect, useMemo } from 'react'
import { MemoryRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import {
  LayoutDashboard,
  BarChart2,
  CheckSquare,
  DollarSign,
  AlertTriangle,
  Users,
  Upload,
  Map,
  FileText,
  Menu,
  X,
  Wifi,
  WifiOff,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'

// i18n must be imported before the pages
import '@merl/i18n'
import { useTranslation } from 'react-i18next'

// Lazy-load MERL pages
const Dashboard = lazy(() => import('@merl/pages/Dashboard'))
const Indicators = lazy(() => import('@merl/pages/Indicators'))
const Activities = lazy(() => import('@merl/pages/Activities'))
const Financials = lazy(() => import('@merl/pages/Financials'))
const Events = lazy(() => import('@merl/pages/Events'))
const Community = lazy(() => import('@merl/pages/Community'))
const UploadPortal = lazy(() => import('@merl/components/UploadPortal/UploadPortal'))
const VanuatuMap = lazy(() => import('@merl/components/MapView/VanuatuMap'))
const CommunityReporter = lazy(() => import('@merl/components/CommunityReport/CommunityReporter'))

// ── Navigation config ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/indicators', labelKey: 'nav.indicators', icon: BarChart2 },
  { to: '/activities', labelKey: 'nav.activities', icon: CheckSquare },
  { to: '/financials', labelKey: 'nav.financials', icon: DollarSign },
  { to: '/events', labelKey: 'nav.events', icon: AlertTriangle },
  { to: '/community', labelKey: 'nav.community', icon: Users },
  { to: '/upload', labelKey: 'nav.upload', icon: Upload },
  { to: '/map', labelKey: 'nav.mapView', icon: Map },
  { to: '/community-report', labelKey: 'nav.communityReport', icon: FileText },
]

// ── Connectivity badge ──────────────────────────────────────────────────
function ConnectivityBadge() {
  const { t } = useTranslation()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const setOn = () => setOnline(true)
    const setOff = () => setOnline(false)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    return () => {
      window.removeEventListener('online', setOn)
      window.removeEventListener('offline', setOff)
    }
  }, [])

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        online
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-800 animate-pulse'
      }`}
      title={online ? t('common.online') : t('common.offline')}
    >
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online ? t('common.online') : t('common.offline')}
    </span>
  )
}

// ── Sidebar nav link ─────────────────────────────────────────────────────
function SideNavLink({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string
  icon: React.ComponentType<{ size: number; className?: string }>
  label: string
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-700 text-white shadow-sm'
            : 'text-blue-100 hover:bg-blue-700/60 hover:text-white'
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

// ── Breadcrumb ───────────────────────────────────────────────────────────
function Breadcrumb() {
  const location = useLocation()
  const { t } = useTranslation()

  const crumbs = location.pathname
    .split('/')
    .filter(Boolean)
    .map((segment, i, arr) => {
      const path = '/' + arr.slice(0, i + 1).join('/')
      const labelMap: Record<string, string> = {
        indicators: 'nav.indicators',
        activities: 'nav.activities',
        financials: 'nav.financials',
        events: 'nav.events',
        community: 'nav.community',
        upload: 'nav.upload',
        map: 'nav.mapView',
        'community-report': 'nav.communityReport',
      }
      return { label: t(labelMap[segment] || segment), path }
    })

  return (
    <nav
      aria-label="breadcrumb"
      className="flex items-center gap-1 text-sm text-gray-500"
    >
      <NavLink to="/" className="hover:text-blue-700 transition-colors">
        {t('nav.dashboard')}
      </NavLink>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight size={14} className="text-gray-400" />
          <span className="text-gray-900 font-medium">{crumb.label}</span>
        </span>
      ))}
    </nav>
  )
}

// ── Loading spinner ──────────────────────────────────────────────────────
function MerlLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700" />
    </div>
  )
}

// ── Inner App (needs to be inside MemoryRouter) ─────────────────────────
function MerlInnerApp({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'bi' : 'en')
  }

  const handleNavClick = () => setSidebarOpen(false)

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex-shrink-0 flex flex-col bg-blue-900 text-white
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0`}
        style={{ borderRadius: '12px 0 0 12px' }}
      >
        {/* Logo / title */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-blue-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
              Vanuatu L&amp;D Fund
            </p>
            <h1 className="text-base font-bold text-white leading-tight">
              MERL Dashboard
            </h1>
          </div>
          <button
            className="lg:hidden p-1 rounded text-blue-300 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
          {NAV_ITEMS.map(({ to, labelKey, icon }) => (
            <SideNavLink
              key={to}
              to={to}
              icon={icon}
              label={t(labelKey)}
              onClick={handleNavClick}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-blue-800 space-y-2">
          <ConnectivityBadge />
          <button
            onClick={toggleLang}
            className="w-full text-left text-xs text-blue-300 hover:text-white transition-colors"
            aria-label="Toggle language"
          >
            {i18n.language === 'en' ? 'Switch to Bislama' : 'Switch to English'}
          </button>
          <p className="text-xs text-blue-400">
            &copy; {new Date().getFullYear()} VCAP2 Project
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4 bg-white border-b border-gray-200 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={onBack}
              aria-label="Back to portal"
              title="Back to VCAP2 Portal"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <Breadcrumb />
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <ConnectivityBadge />
            <button
              onClick={toggleLang}
              className="text-xs text-gray-500 hover:text-blue-700 transition-colors"
            >
              {i18n.language === 'en' ? 'Bislama' : 'English'}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Suspense fallback={<MerlLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/indicators" element={<Indicators />} />
              <Route path="/activities" element={<Activities />} />
              <Route path="/financials" element={<Financials />} />
              <Route path="/events" element={<Events />} />
              <Route path="/community" element={<Community />} />
              <Route path="/upload" element={<UploadPortal />} />
              <Route path="/map" element={<VanuatuMap />} />
              <Route path="/community-report" element={<CommunityReporter />} />
              <Route
                path="*"
                element={
                  <div className="flex items-center justify-center h-full p-8">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-800 mb-2">
                        404 — Page Not Found
                      </h2>
                      <p className="text-gray-500 mb-4">
                        The page you are looking for does not exist.
                      </p>
                      <NavLink to="/" className="btn-primary">
                        Back to Dashboard
                      </NavLink>
                    </div>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

// ── Main MerlDashboard wrapper ──────────────────────────────────────────
export default function MerlDashboard({
  onBack,
}: {
  onBack?: () => void
}) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            retry: (failureCount, error) => {
              const status = (error as { response?: { status?: number } })?.response?.status
              if (status && status >= 400 && status < 500) return false
              return failureCount < 3
            },
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
    [],
  )

  const handleBack = onBack ?? (() => {})

  return (
    <div className="merl-wrapper" style={{ height: 'calc(100vh - var(--header-height) - 3rem)' }}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerlInnerApp onBack={handleBack} />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '8px',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#22c55e', secondary: '#f8fafc' } },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#f8fafc' },
                duration: 6000,
              },
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </div>
  )
}
