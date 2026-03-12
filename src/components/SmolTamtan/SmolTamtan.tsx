/**
 * Smol Tamtan – 3-D Animated Globe AI Assistant
 *
 * Renders a floating animated globe in the bottom-right corner.
 * Clicking it opens a chat popup that answers questions about
 * portal data only (no data modification, no architecture leaks).
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { askSmolTamtan, type ChatMessage } from '../../services/smolTamtanService'
import './SmolTamtan.css'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Halo! I'm Smol Tamtan! 🌏\n\nI'm your guide to the conservation data in this portal. Ask me about datasets, protected areas, field observations, species, or anything else you see here!\n\nWhat would you like to explore today?",
}

const SUGGESTIONS = [
  'How many datasets are in the portal?',
  'What protected areas are recorded?',
  'Show me recent field observations',
  'What types of data are available?',
]

// ─── Globe Character ────────────────────────────────────────────────────────────

function SmolGlobe({
  size = 'lg',
  floating = false,
  thinking = false,
}: {
  size?: 'lg' | 'sm' | 'xs'
  floating?: boolean
  thinking?: boolean
}) {
  const wrapCls = [
    'st-globe-wrap',
    `st-globe-wrap--${size}`,
    floating ? 'st-globe-wrap--floating' : '',
    thinking ? 'st-globe-wrap--thinking' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapCls}>
      {/* Rainbow orbit ring (large only) */}
      {size === 'lg' && <div className="st-ring" aria-hidden="true" />}

      {/* Outer glow */}
      <div className="st-glow" aria-hidden="true" />

      {/* The 3-D sphere */}
      <div className="st-sphere">
        {/* Animated grid lines */}
        <div className="st-grid" aria-hidden="true" />

        {/* Island / land patches */}
        <div className="st-land st-land-a" aria-hidden="true" />
        <div className="st-land st-land-b" aria-hidden="true" />
        <div className="st-land st-land-c" aria-hidden="true" />
        <div className="st-land st-land-d" aria-hidden="true" />

        {/* Specular highlight */}
        <div className="st-shine" aria-hidden="true" />

        {/* Face */}
        <div className="st-face" aria-hidden="true">
          {/* Left eye */}
          <div className="st-eye st-eye-l">
            <div className="st-pupil" />
            <div className="st-eye-shine" />
          </div>
          {/* Right eye */}
          <div className="st-eye st-eye-r">
            <div className="st-pupil" />
            <div className="st-eye-shine" />
          </div>
          {/* Rosy cheeks */}
          <div className="st-cheek st-cheek-l" />
          <div className="st-cheek st-cheek-r" />
          {/* Smile */}
          <div className="st-smile" />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function SmolTamtan() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Focus input when popup opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 280)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // ── Send a message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || isLoading) return

      setShowSuggestions(false)

      const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content }
      setMessages((prev) => [...prev, userMsg])
      setDraft('')
      setIsLoading(true)
      setStreamingContent('')

      try {
        // Build conversation history (skip the static welcome message)
        const history: ChatMessage[] = [...messages, userMsg]
          .filter((m) => m.id !== 'welcome')
          .map((m) => ({ role: m.role, content: m.content }))

        let accumulated = ''

        await askSmolTamtan(history, (token) => {
          accumulated += token
          setStreamingContent(accumulated)
        })

        const botMsg: Message = {
          id: `b-${Date.now()}`,
          role: 'assistant',
          content: accumulated,
        }
        setMessages((prev) => [...prev, botMsg])
      } catch (err) {
        const errMsg: Message = {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `Oops! Something went wrong connecting to my brain. Please try again in a moment!\n\n(${err instanceof Error ? err.message : 'Unknown error'})`,
        }
        setMessages((prev) => [...prev, errMsg])
      } finally {
        setIsLoading(false)
        setStreamingContent(null)
      }
    },
    [messages, isLoading],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(draft)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="st-container" ref={popupRef}>
      {/* ── Chat popup ─────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="st-popup" role="dialog" aria-label="Smol Tamtan portal assistant">
          {/* Header */}
          <div className="st-header">
            <SmolGlobe size="sm" />
            <div className="st-header-info">
              <span className="st-header-name">Smol Tamtan</span>
              <span className="st-header-sub">
                <span className="st-online-dot" />
                Portal Assistant
              </span>
            </div>
            <button
              className="st-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close Smol Tamtan"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="st-messages" role="log" aria-live="polite">
            {messages.map((msg) => (
              <div key={msg.id} className={`st-msg st-msg--${msg.role === 'user' ? 'user' : 'bot'}`}>
                {msg.role === 'assistant' && <SmolGlobe size="xs" />}
                <div className="st-bubble">{msg.content}</div>
              </div>
            ))}

            {/* Streaming response in progress */}
            {isLoading && streamingContent !== null && streamingContent.length > 0 && (
              <div className="st-msg st-msg--bot">
                <SmolGlobe size="xs" thinking />
                <div className="st-bubble">{streamingContent}</div>
              </div>
            )}

            {/* Loading dots (before first token arrives) */}
            {isLoading && (streamingContent === null || streamingContent.length === 0) && (
              <div className="st-msg st-msg--bot">
                <SmolGlobe size="xs" thinking />
                <div className="st-bubble st-bubble--loading">
                  <span className="st-type-dot" />
                  <span className="st-type-dot" />
                  <span className="st-type-dot" />
                </div>
              </div>
            )}

            {/* Suggestion chips (shown only before first user message) */}
            {showSuggestions && !isLoading && (
              <div className="st-suggestions">
                <p className="st-suggest-label">Try asking:</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="st-chip" onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="st-input-row">
            <input
              ref={inputRef}
              className="st-input"
              type="text"
              placeholder="Ask about portal data…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              aria-label="Message Smol Tamtan"
            />
            <button
              className="st-send-btn"
              onClick={() => sendMessage(draft)}
              disabled={isLoading || !draft.trim()}
              aria-label="Send message"
            >
              ➤
            </button>
          </div>

          {/* Disclaimer */}
          <div className="st-footer">
            Smol Tamtan can only discuss data visible in this portal.
          </div>
        </div>
      )}

      {/* ── Launcher button ─────────────────────────────────────────────── */}
      <button
        className="st-launcher"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? 'Close Smol Tamtan' : 'Open Smol Tamtan portal assistant'}
        aria-expanded={isOpen}
      >
        <SmolGlobe size="lg" floating={!isOpen} />
        {!isOpen && <span className="st-launcher-label">Smol Tamtan</span>}
      </button>
    </div>
  )
}
