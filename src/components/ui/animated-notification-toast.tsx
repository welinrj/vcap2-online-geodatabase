import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import Icons8Icon from '../Icons8Icon'

/**
 * Animated Notification Toast inspired by 21st.dev notification components.
 * Features themed variants, smooth entrance/exit animations, progress indicator,
 * and auto-dismiss with hover pause.
 */

export type ToastTheme = 'success' | 'error' | 'info' | 'message' | 'call' | 'videocall' | 'attachment' | 'group'

interface AnimatedToastProps {
  id: string
  title: string
  body?: string
  theme?: ToastTheme
  duration?: number
  onDismiss: (id: string) => void
  onClick?: () => void
}

const THEME_CONFIG: Record<ToastTheme, { icon: string; color: string; bgAccent: string }> = {
  success: { icon: 'approval', color: '#22c55e', bgAccent: 'rgba(34, 197, 94, 0.12)' },
  error: { icon: 'error', color: '#ef4444', bgAccent: 'rgba(239, 68, 68, 0.12)' },
  info: { icon: 'info', color: '#3b82f6', bgAccent: 'rgba(59, 130, 246, 0.12)' },
  message: { icon: 'chat', color: '#3b82f6', bgAccent: 'rgba(59, 130, 246, 0.12)' },
  call: { icon: 'phone', color: '#22c55e', bgAccent: 'rgba(34, 197, 94, 0.12)' },
  videocall: { icon: 'video-call', color: '#a855f7', bgAccent: 'rgba(168, 85, 247, 0.12)' },
  attachment: { icon: 'paperclip', color: '#f59e0b', bgAccent: 'rgba(245, 158, 11, 0.12)' },
  group: { icon: 'group', color: '#06b6d4', bgAccent: 'rgba(6, 182, 212, 0.12)' },
}

export function AnimatedToast({
  id,
  title,
  body,
  theme = 'info',
  duration = 5000,
  onDismiss,
  onClick,
}: AnimatedToastProps) {
  const [state, setState] = useState<'entering' | 'visible' | 'exiting'>('entering')
  const [progress, setProgress] = useState(100)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>(null)
  const progressRef = useRef(100)

  const config = THEME_CONFIG[theme]

  const dismiss = useCallback(() => {
    setState('exiting')
    setTimeout(() => onDismiss(id), 300)
  }, [id, onDismiss])

  // Enter animation
  useEffect(() => {
    const t = setTimeout(() => setState('visible'), 50)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss timer with progress
  useEffect(() => {
    if (duration <= 0) return

    const tick = 50
    timerRef.current = setInterval(() => {
      if (paused) return
      progressRef.current -= (tick / duration) * 100
      if (progressRef.current <= 0) {
        progressRef.current = 0
        setProgress(0)
        dismiss()
      } else {
        setProgress(progressRef.current)
      }
    }, tick)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [duration, paused, dismiss])

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex w-[360px] max-w-[calc(100vw-2rem)] items-center gap-3 overflow-hidden rounded-xl border border-white/10 px-4 py-3 shadow-2xl backdrop-blur-xl',
        'cursor-pointer transition-all duration-300 ease-out',
        state === 'entering' && 'translate-x-[120%] opacity-0',
        state === 'visible' && 'translate-x-0 opacity-100',
        state === 'exiting' && 'translate-x-[120%] opacity-0 scale-95',
      )}
      style={{
        background: `linear-gradient(135deg, var(--color-surface-solid) 0%, ${config.bgAccent} 100%)`,
      }}
      onClick={() => {
        onClick?.()
        dismiss()
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Theme icon */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: config.bgAccent }}
      >
        <Icons8Icon name={config.icon} size={18} color={config.color} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.8rem] font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </div>
        {body && (
          <div className="mt-0.5 truncate text-[0.75rem]" style={{ color: 'var(--color-text-secondary)' }}>
            {body}
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        className="flex-shrink-0 rounded-md p-1 transition-colors hover:bg-white/10"
        style={{ color: 'var(--color-text-tertiary)' }}
        onClick={(e) => {
          e.stopPropagation()
          dismiss()
        }}
      >
        <Icons8Icon name="cancel" size={14} />
      </button>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <div
            className="h-full transition-[width] duration-100 ease-linear"
            style={{
              width: `${progress}%`,
              backgroundColor: config.color,
              opacity: 0.6,
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Toast container that manages a stack of animated toasts.
 * Renders in a fixed position at the top-right of the viewport.
 */
interface ToastItem {
  id: string
  title: string
  body?: string
  theme?: ToastTheme
  duration?: number
  onClick?: () => void
}

interface AnimatedToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export function AnimatedToastContainer({ toasts, onDismiss }: AnimatedToastContainerProps) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-3">
      {toasts.map((toast) => (
        <AnimatedToast
          key={toast.id}
          id={toast.id}
          title={toast.title}
          body={toast.body}
          theme={toast.theme}
          duration={toast.duration}
          onDismiss={onDismiss}
          onClick={toast.onClick}
        />
      ))}
    </div>
  )
}
