import { useRef, useCallback, useEffect, forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Auto-resizing Textarea inspired by 21st.dev / Alwurts use-textarea-resize.
 * Automatically grows/shrinks based on content, with optional min/max rows.
 */

interface AutoResizeTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
  /** Minimum number of visible rows (default: 1) */
  minRows?: number
  /** Maximum number of visible rows before scrolling (default: 8) */
  maxRows?: number
  /** Additional class names */
  className?: string
  /** Called when the textarea value changes */
  onValueChange?: (value: string) => void
}

export const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ minRows = 1, maxRows = 8, className, onValueChange, onChange, value, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLTextAreaElement>(null)

    // Merge forwarded ref with internal ref
    const setRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
        if (typeof forwardedRef === 'function') {
          forwardedRef(el)
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
        }
      },
      [forwardedRef],
    )

    const resize = useCallback(() => {
      const el = internalRef.current
      if (!el) return

      // Reset height to auto so scrollHeight recalculates
      el.style.height = 'auto'

      // Get line height from computed styles
      const computed = window.getComputedStyle(el)
      const lineHeight = parseFloat(computed.lineHeight) || 20
      const paddingTop = parseFloat(computed.paddingTop) || 0
      const paddingBottom = parseFloat(computed.paddingBottom) || 0
      const borderTop = parseFloat(computed.borderTopWidth) || 0
      const borderBottom = parseFloat(computed.borderBottomWidth) || 0

      const minHeight = lineHeight * minRows + paddingTop + paddingBottom + borderTop + borderBottom
      const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom

      const newHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
      el.style.height = `${newHeight}px`
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }, [minRows, maxRows])

    // Resize when value changes externally (controlled)
    useEffect(() => {
      resize()
    }, [value, resize])

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(e)
        onValueChange?.(e.target.value)
        resize()
      },
      [onChange, onValueChange, resize],
    )

    return (
      <textarea
        ref={setRef}
        value={value}
        onChange={handleChange}
        rows={minRows}
        className={cn(
          'w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2',
          'text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]',
          'outline-none transition-colors duration-150',
          'focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30',
          'scrollbar-thin scrollbar-thumb-white/10',
          className,
        )}
        {...props}
      />
    )
  },
)

AutoResizeTextarea.displayName = 'AutoResizeTextarea'
