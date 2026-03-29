import { useState, useEffect, useMemo, type FC } from 'react'
import type { UserProfile } from '../../types/user'
import {
  listAllActivities,
  getActivitiesForDate,
  ACTIVITY_TYPES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type Activity,
} from '../../services/activityStore'
import { listUsers, deduplicateUsers } from '../../services/userStore'
import Icons8Icon from '../Icons8Icon'
import './ActivityCalendar.css'

interface ActivityCalendarProps {
  currentUser: UserProfile | null
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_ICONS: Record<string, string> = {
  planned: 'radio',
  'in-progress': 'clock',
  completed: 'approval',
  cancelled: 'cancel',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--color-negative)',
  medium: 'var(--color-accent-amber)',
  low: 'var(--color-text-tertiary)',
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const ActivityCalendar: FC<ActivityCalendarProps> = ({ currentUser }) => {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [activities, setActivities] = useState<Activity[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [filterUserId, setFilterUserId] = useState<string>('')
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [acts, users] = await Promise.all([listAllActivities(), listUsers()])
        setActivities(acts)
        setAllUsers(deduplicateUsers(users))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Filter activities by selected user
  const filteredActivities = useMemo(() => {
    if (!filterUserId) return activities
    return activities.filter((a) => a.assignedTo === filterUserId || a.createdBy === filterUserId)
  }, [activities, filterUserId])

  // Active (non-cancelled) activities for availability
  const activeActivities = useMemo(
    () => filteredActivities.filter((a) => a.status !== 'cancelled'),
    [filteredActivities],
  )

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const days: { date: string; day: number; isCurrentMonth: boolean; isToday: boolean }[] = []

    // Previous month padding
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const prevDays = getDaysInMonth(prevYear, prevMonth)
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i
      days.push({ date: toDateStr(prevYear, prevMonth, d), day: d, isCurrentMonth: false, isToday: false })
    }

    // Current month
    const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
    for (let d = 1; d <= daysInMonth; d++) {
      const date = toDateStr(year, month, d)
      days.push({ date, day: d, isCurrentMonth: true, isToday: date === todayStr })
    }

    // Next month padding
    const remaining = 42 - days.length
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: toDateStr(nextYear, nextMonth, d), day: d, isCurrentMonth: false, isToday: false })
    }

    return days
  }, [year, month, today])

  // Activities per date (for dots)
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const day of calendarDays) {
      const dayActs = getActivitiesForDate(activeActivities, day.date)
      if (dayActs.length > 0) map.set(day.date, dayActs)
    }
    return map
  }, [calendarDays, activeActivities])

  // Activities for selected date
  const selectedDateActivities = useMemo(() => {
    if (!selectedDate) return []
    return getActivitiesForDate(filteredActivities, selectedDate)
  }, [selectedDate, filteredActivities])

  // User availability for current month — includes ALL users
  const userAvailability = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month)
    const monthStart = toDateStr(year, month, 1)
    const monthEnd = toDateStr(year, month, daysInMonth)

    return allUsers.map((user) => {
      const userActs = activities.filter(
        (a) =>
          (a.assignedTo === user.id || a.createdBy === user.id) &&
          a.status !== 'cancelled' &&
          a.startDate &&
          a.startDate <= monthEnd &&
          (a.endDate || a.startDate) >= monthStart,
      )
      const busyDays = new Set<string>()
      for (const a of userActs) {
        const start = new Date(Math.max(new Date(a.startDate).getTime(), new Date(monthStart).getTime()))
        const end = new Date(Math.min(new Date(a.endDate || a.startDate).getTime(), new Date(monthEnd).getTime()))
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          busyDays.add(d.toISOString().slice(0, 10))
        }
      }
      return { user, busyDays: busyDays.size, totalDays: daysInMonth, activities: userActs }
    }).sort((a, b) => b.busyDays - a.busyDays)
  }, [allUsers, activities, year, month])

  const freeCount = userAvailability.filter((u) => u.busyDays === 0).length
  const busyCount = userAvailability.length - freeCount

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0) }
    else setMonth(month + 1)
  }

  function goToToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  if (!currentUser) return null

  return (
    <div className="ac">
      {/* Header */}
      <div className="ac-header">
        <div className="ac-header-left">
          <h2 className="ac-title">
            <Icons8Icon name="calendar" size={22} /> Activity Calendar
          </h2>
          <span className="ac-subtitle">
            View schedules and team availability
          </span>
        </div>
        <div className="ac-header-right">
          <label className="ac-filter-label">
            <Icons8Icon name="group" size={14} /> Show:
          </label>
          <select
            className="ac-filter-select"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
          >
            <option value="">All Users</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="ac-loading">Loading activities...</div>
      ) : (
        <div className="ac-layout">
          {/* Calendar */}
          <div className="ac-calendar-panel">
            {/* Month nav */}
            <div className="ac-month-nav">
              <button className="ac-nav-btn" onClick={prevMonth}>
                <Icons8Icon name="chevron-left" size={18} />
              </button>
              <h3 className="ac-month-title">{MONTHS[month]} {year}</h3>
              <button className="ac-nav-btn" onClick={nextMonth}>
                <Icons8Icon name="chevron-right" size={18} />
              </button>
              <button className="ac-today-btn" onClick={goToToday}>Today</button>
            </div>

            {/* Weekday headers */}
            <div className="ac-weekdays">
              {WEEKDAYS.map((d) => (
                <div key={d} className="ac-weekday">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="ac-days">
              {calendarDays.map((day) => {
                const dayActs = activitiesByDate.get(day.date) ?? []
                const isSelected = day.date === selectedDate
                return (
                  <button
                    key={day.date}
                    className={[
                      'ac-day',
                      !day.isCurrentMonth && 'ac-day-outside',
                      day.isToday && 'ac-day-today',
                      isSelected && 'ac-day-selected',
                      dayActs.length > 0 && 'ac-day-has-activities',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedDate(isSelected ? null : day.date)}
                  >
                    <span className="ac-day-num">{day.day}</span>
                    {dayActs.length > 0 && (
                      <div className="ac-day-dots">
                        {dayActs.slice(0, 3).map((a, i) => (
                          <span
                            key={i}
                            className="ac-dot"
                            style={{ background: PRIORITY_COLORS[a.priority] }}
                          />
                        ))}
                        {dayActs.length > 3 && <span className="ac-dot-more">+{dayActs.length - 3}</span>}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="ac-legend">
              <span className="ac-legend-item">
                <span className="ac-dot" style={{ background: PRIORITY_COLORS.high }} /> High
              </span>
              <span className="ac-legend-item">
                <span className="ac-dot" style={{ background: PRIORITY_COLORS.medium }} /> Medium
              </span>
              <span className="ac-legend-item">
                <span className="ac-dot" style={{ background: PRIORITY_COLORS.low }} /> Low
              </span>
            </div>
          </div>

          {/* Side panel — always shows availability; date detail shown above when selected */}
          <div className="ac-side-panel">
            {/* Selected date activities */}
            {selectedDate && (
              <div className="ac-date-detail">
                <div className="ac-detail-header">
                  <h4>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h4>
                  <button className="ac-close-btn" onClick={() => setSelectedDate(null)}>
                    <Icons8Icon name="cancel" size={16} />
                  </button>
                </div>
                {selectedDateActivities.length === 0 ? (
                  <p className="ac-no-activities">No activities scheduled</p>
                ) : (
                  <div className="ac-activity-list">
                    {selectedDateActivities.map((a) => {
                      const statusIconName = STATUS_ICONS[a.status]
                      return (
                        <button
                          key={a.id}
                          className={`ac-activity-item ac-activity-${a.priority}`}
                          onClick={() => setSelectedActivity(a)}
                        >
                          <div className="ac-activity-top">
                            <Icons8Icon name={statusIconName} size={14} className={`ac-status-icon ac-status-${a.status}`} />
                            <span className="ac-activity-title">{a.title}</span>
                          </div>
                          <div className="ac-activity-meta">
                            <span><Icons8Icon name="user" size={12} /> {a.assignedToName || a.createdByName || 'Unassigned'}</span>
                            <span className="badge badge-format">{ACTIVITY_TYPES[a.type]}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Team availability — always visible */}
            <div className={`ac-availability ${selectedDate ? 'ac-avail-below-date' : ''}`}>
              <h4 className="ac-avail-title">
                <Icons8Icon name="group" size={16} /> Officer Availability — {MONTHS[month]}
              </h4>

              {/* Summary counts */}
              {userAvailability.length > 0 && (
                <div className="ac-avail-summary">
                  <div className="ac-avail-summary-item ac-avail-summary-busy">
                    <span className="ac-avail-summary-count">{busyCount}</span>
                    <span className="ac-avail-summary-label">Assigned</span>
                  </div>
                  <div className="ac-avail-summary-item ac-avail-summary-free">
                    <span className="ac-avail-summary-count">{freeCount}</span>
                    <span className="ac-avail-summary-label">Free</span>
                  </div>
                  <div className="ac-avail-summary-item ac-avail-summary-total">
                    <span className="ac-avail-summary-count">{userAvailability.length}</span>
                    <span className="ac-avail-summary-label">Total</span>
                  </div>
                </div>
              )}

              {userAvailability.length === 0 ? (
                <p className="ac-no-activities">No officers registered</p>
              ) : (
                <div className="ac-avail-list">
                  {userAvailability.map(({ user, busyDays, totalDays, activities: userActs }) => {
                    const pct = Math.round((busyDays / totalDays) * 100)
                    const isFree = busyDays === 0
                    const isExpanded = expandedUserId === user.id
                    return (
                      <div key={user.id} className={`ac-avail-user ${isFree ? 'ac-avail-user-free' : ''}`}>
                        <button
                          className="ac-avail-user-toggle"
                          onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                        >
                          <div className="ac-avail-user-header">
                            <div className="ac-avail-user-info">
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.name} className="ac-avail-avatar" />
                              ) : (
                                <span className="ac-avail-avatar ac-avail-avatar-fallback">
                                  {user.name.charAt(0).toUpperCase()}
                                </span>
                              )}
                              <div>
                                <span className="ac-avail-name">{user.name}</span>
                                <span className="ac-avail-role">{user.position || user.role || 'Officer'}</span>
                              </div>
                            </div>
                            <span className={`ac-avail-badge ${isFree ? 'ac-avail-free' : pct > 70 ? 'ac-avail-busy' : pct > 30 ? 'ac-avail-moderate' : 'ac-avail-light'}`}>
                              {isFree ? 'Free' : pct > 70 ? 'Busy' : pct > 30 ? 'Moderate' : 'Light'}
                            </span>
                          </div>
                          {!isFree && (
                            <>
                              <div className="ac-avail-bar-track">
                                <div
                                  className={`ac-avail-bar-fill ${pct > 70 ? 'ac-bar-busy' : pct > 30 ? 'ac-bar-moderate' : 'ac-bar-free'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="ac-avail-stats">
                                <span>{busyDays} busy day{busyDays !== 1 ? 's' : ''}</span>
                                <span>{userActs.length} activit{userActs.length !== 1 ? 'ies' : 'y'}</span>
                              </div>
                            </>
                          )}
                          {isFree && (
                            <div className="ac-avail-stats">
                              <span>No activities this month</span>
                            </div>
                          )}
                        </button>

                        {/* Expanded: officer's activities for this month */}
                        {isExpanded && userActs.length > 0 && (
                          <div className="ac-avail-activities">
                            {userActs
                              .sort((a, b) => a.startDate.localeCompare(b.startDate))
                              .map((a) => (
                                <button
                                  key={a.id}
                                  className={`ac-activity-item ac-activity-${a.priority}`}
                                  onClick={() => setSelectedActivity(a)}
                                >
                                  <div className="ac-activity-top">
                                    <Icons8Icon name={STATUS_ICONS[a.status]} size={14} className={`ac-status-icon ac-status-${a.status}`} />
                                    <span className="ac-activity-title">{a.title}</span>
                                  </div>
                                  <div className="ac-activity-meta">
                                    <span>
                                      <Icons8Icon name="calendar" size={12} />
                                      {a.startDate.slice(5)}
                                      {a.endDate && a.endDate !== a.startDate ? ` — ${a.endDate.slice(5)}` : ''}
                                    </span>
                                    <span className="badge badge-format">{ACTIVITY_TYPES[a.type]}</span>
                                  </div>
                                </button>
                              ))}
                          </div>
                        )}
                        {isExpanded && userActs.length === 0 && (
                          <div className="ac-avail-activities">
                            <p className="ac-avail-empty">Available for assignment</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Activity detail modal */}
      {selectedActivity && (
        <div className="ac-modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ac-modal-header">
              <h3>{selectedActivity.title}</h3>
              <button className="ac-close-btn" onClick={() => setSelectedActivity(null)}>
                <Icons8Icon name="cancel" size={18} />
              </button>
            </div>
            <div className="ac-modal-body">
              {selectedActivity.description && (
                <p className="ac-modal-desc">{selectedActivity.description}</p>
              )}
              <div className="ac-modal-fields">
                <div className="ac-modal-field">
                  <span className="ac-modal-label">Status</span>
                  <span className={`badge badge-${selectedActivity.status === 'completed' ? 'active' : selectedActivity.status === 'in-progress' ? 'active' : 'draft'}`}>
                    {STATUS_LABELS[selectedActivity.status]}
                  </span>
                </div>
                <div className="ac-modal-field">
                  <span className="ac-modal-label">Type</span>
                  <span className="badge badge-format">{ACTIVITY_TYPES[selectedActivity.type]}</span>
                </div>
                <div className="ac-modal-field">
                  <span className="ac-modal-label">Priority</span>
                  <span className={`ap-priority ap-priority-${selectedActivity.priority}`}>
                    {PRIORITY_LABELS[selectedActivity.priority]}
                  </span>
                </div>
                <div className="ac-modal-field">
                  <span className="ac-modal-label"><Icons8Icon name="user" size={13} /> Assigned To</span>
                  <span>{selectedActivity.assignedToName || selectedActivity.createdByName || 'Unassigned'}</span>
                </div>
                {selectedActivity.areaName && (
                  <div className="ac-modal-field">
                    <span className="ac-modal-label"><Icons8Icon name="map-pin" size={13} /> Area</span>
                    <span>{selectedActivity.areaName}</span>
                  </div>
                )}
                <div className="ac-modal-field">
                  <span className="ac-modal-label"><Icons8Icon name="calendar" size={13} /> Dates</span>
                  <span>
                    {selectedActivity.startDate}
                    {selectedActivity.endDate && selectedActivity.endDate !== selectedActivity.startDate
                      ? ` — ${selectedActivity.endDate}`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ActivityCalendar
