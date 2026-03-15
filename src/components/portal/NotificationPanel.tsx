import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bell,
  MessageSquare,
  Phone,
  Video,
  Paperclip,
  Users,
  Check,
  CheckCheck,
  X,
} from 'lucide-react'
import type { UserProfile } from '../../types/user'
import type { AppNotification } from '../../types/messaging'
import {
  onNotificationsChanged,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../../services/messagingStore'
import { playNotificationSound } from '../../services/notificationSounds'
import { AnimatedToastContainer, type ToastTheme } from '../ui/animated-notification-toast'

interface NotificationPanelProps {
  currentUser: UserProfile | null
  onNavigateToChat?: (conversationId: string) => void
}

/** Map notification type to toast theme */
function notifTypeToTheme(type: AppNotification['type']): ToastTheme {
  switch (type) {
    case 'message': return 'message'
    case 'call': return 'call'
    case 'videocall': return 'videocall'
    case 'attachment': return 'attachment'
    case 'group_invite': return 'group'
    default: return 'info'
  }
}

interface ToastItem {
  id: string
  title: string
  body?: string
  theme?: ToastTheme
  onClick?: () => void
}

export default function NotificationPanel({ currentUser, onNavigateToChat }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Subscribe to notifications
  useEffect(() => {
    if (!currentUser) return
    return onNotificationsChanged(currentUser.id, (notifs) => {
      // Show animated toast + play sound for new unread notifications
      const unreadCount = notifs.filter((n) => !n.read).length
      if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
        const newest = notifs.find((n) => !n.read)
        if (newest) {
          playNotificationSound()
          setToasts((prev) => [
            ...prev,
            {
              id: newest.id,
              title: newest.title,
              body: newest.body,
              theme: notifTypeToTheme(newest.type),
              onClick: () => {
                if (newest.conversationId && onNavigateToChat) {
                  onNavigateToChat(newest.conversationId)
                }
                markNotificationRead(newest.id)
              },
            },
          ])
        }
      }
      prevCountRef.current = unreadCount
      setNotifications(notifs)
    })
  }, [currentUser, onNavigateToChat])

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unreadCount = notifications.filter((n) => !n.read).length

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'message': return <MessageSquare size={14} />
      case 'call': return <Phone size={14} />
      case 'videocall': return <Video size={14} />
      case 'attachment': return <Paperclip size={14} />
      case 'group_invite': return <Users size={14} />
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const handleClick = async (notif: AppNotification) => {
    if (!notif.read) await markNotificationRead(notif.id)
    if (notif.conversationId && onNavigateToChat) {
      onNavigateToChat(notif.conversationId)
      setOpen(false)
    }
  }

  if (!currentUser) return null

  return (
    <>
      {/* Notification Bell */}
      <div className="notif-wrapper" ref={panelRef}>
        <button className="notif-bell" onClick={() => setOpen((o) => !o)}>
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>

        {/* Dropdown Panel */}
        {open && (
          <div className="notif-panel">
            <div className="notif-panel-header">
              <h4>Notifications</h4>
              {unreadCount > 0 && (
                <button
                  className="notif-mark-all"
                  onClick={() => markAllNotificationsRead(currentUser.id)}
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
            </div>
            <div className="notif-list">
              {notifications.length === 0 ? (
                <div className="notif-empty">No notifications</div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`notif-item ${!notif.read ? 'notif-unread' : ''}`}
                    onClick={() => handleClick(notif)}
                  >
                    <span className={`notif-icon notif-icon-${notif.type}`}>
                      {getIcon(notif.type)}
                    </span>
                    <div className="notif-content">
                      <div className="notif-title">{notif.title}</div>
                      <div className="notif-body">{notif.body}</div>
                      <div className="notif-time">{formatTime(notif.createdAt)}</div>
                    </div>
                    <div className="notif-actions">
                      {!notif.read && (
                        <button
                          className="notif-action-btn"
                          onClick={(e) => { e.stopPropagation(); markNotificationRead(notif.id) }}
                          title="Mark read"
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        className="notif-action-btn notif-action-delete"
                        onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id) }}
                        title="Delete"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Animated Toast Notifications */}
      <AnimatedToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
