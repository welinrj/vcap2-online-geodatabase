import { useState, useEffect, useRef, useCallback } from 'react'
import Icons8Icon from './Icons8Icon'
import type { UserProfile } from '../types/user'
import type { Conversation, Message } from '../types/messaging'
import {
  createConversation,
  findDirectConversation,
  onConversationsChanged,
  onMessagesChanged,
  sendMessage,
  deleteConversation,
  createNotification,
} from '../services/messagingStore'
import { listUsers } from '../services/userStore'
import { playMessageSound, playAttachmentSound } from '../services/notificationSounds'
import { AutoResizeTextarea } from './ui/auto-resize-textarea'

interface ChatPopupProps {
  currentUser: UserProfile
  onStartCall?: (calleeId: string, calleeName: string, type: 'video' | 'audio') => void
}

export default function ChatPopup({ currentUser, onStartCall }: ChatPopupProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [chatError, setChatError] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [convSearch, setConvSearch] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevMsgCount = useRef(0)
  const lastSeenRef = useRef<Record<string, number>>({})

  const clearActiveConv = useCallback(() => {
    setActiveConv(null)
    setMessages([])
    prevMsgCount.current = 0
  }, [])

  // Load users when new chat or group modal opens
  const needsUsers = showNewChat || showNewGroup
  const usersLoading = needsUsers && allUsers.length === 0
  useEffect(() => {
    if (!needsUsers) return
    if (allUsers.length > 0) return // already loaded
    let cancelled = false
    listUsers()
      .then((users) => { if (!cancelled) setAllUsers(users) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [needsUsers, allUsers.length])

  // Subscribe to conversations
  useEffect(() => {
    return onConversationsChanged(currentUser.id, (convs) => {
      setConversations(convs)
      // Track unread: count conversations with messages newer than last seen
      let count = 0
      for (const c of convs) {
        if (c.lastMessageAt && c.lastMessageBy !== currentUser.id) {
          const lastSeen = lastSeenRef.current[c.id] || 0
          const msgTime = new Date(c.lastMessageAt).getTime()
          if (msgTime > lastSeen) count++
        }
      }
      if (!isOpen) setUnreadCount(count)
    })
  }, [currentUser.id, isOpen])

  const activeConvId = activeConv?.id ?? null

  // Subscribe to messages for active conversation
  useEffect(() => {
    if (!activeConvId) return
    return onMessagesChanged(activeConvId, (msgs) => {
      setMessages(msgs)
      if (msgs.length > prevMsgCount.current && prevMsgCount.current > 0) {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg.senderId !== currentUser.id) {
          if (lastMsg.attachmentName) {
            playAttachmentSound()
          } else {
            playMessageSound()
          }
        }
      }
      prevMsgCount.current = msgs.length
      // Mark as seen
      lastSeenRef.current[activeConvId] = Date.now()
    })
  }, [activeConvId, currentUser.id])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id)

  const getConvDisplayName = useCallback(
    (conv: Conversation): string => {
      if (conv.type === 'group') return conv.name || 'Group Chat'
      const otherId = conv.participants.find((p) => p !== currentUser.id)
      return otherId ? (conv.participantNames[otherId] || 'User') : 'Chat'
    },
    [currentUser.id],
  )

  const getConvAvatar = useCallback(
    (conv: Conversation): string => {
      if (conv.type === 'group') return 'G'
      const otherId = conv.participants.find((p) => p !== currentUser.id)
      const name = otherId ? (conv.participantNames[otherId] || '?') : '?'
      return name.charAt(0).toUpperCase()
    },
    [currentUser.id],
  )

  const startDirectChat = async (user: UserProfile) => {
    setChatError(null)
    try {
      let conv = await findDirectConversation(currentUser.id, user.id)
      if (!conv) {
        conv = await createConversation(
          'direct',
          [currentUser.id, user.id],
          { [currentUser.id]: currentUser.name, [user.id]: user.name },
          currentUser.id,
        )
      }
      setActiveConv(conv)
      setShowNewChat(false)
      setUserSearch('')
    } catch {
      setChatError('Could not start chat. Please try again.')
    }
  }

  const handleCreateGroup = async () => {
    if (selectedUsers.length === 0 || !groupName.trim()) return
    const participants = [currentUser.id, ...selectedUsers]
    const names: Record<string, string> = { [currentUser.id]: currentUser.name }
    selectedUsers.forEach((uid) => {
      const u = allUsers.find((u2) => u2.id === uid)
      if (u) names[uid] = u.name
    })
    const conv = await createConversation('group', participants, names, currentUser.id, groupName.trim())
    for (const uid of selectedUsers) {
      try {
        await createNotification({
          userId: uid,
          type: 'group_invite',
          title: 'Added to group',
          body: `${currentUser.name} added you to "${groupName.trim()}"`,
          conversationId: conv.id,
          fromUserId: currentUser.id,
          fromUserName: currentUser.name,
        })
      } catch {
        // Notification failure is non-fatal
      }
    }
    setActiveConv(conv)
    setShowNewGroup(false)
    setGroupName('')
    setSelectedUsers([])
  }

  const handleSend = async () => {
    if (!activeConv || !draft.trim()) return
    const text = draft.trim()
    setDraft('')
    await sendMessage(activeConv.id, currentUser.id, currentUser.name, text)
    const others = activeConv.participants.filter((p) => p !== currentUser.id)
    for (const uid of others) {
      try {
        await createNotification({
          userId: uid,
          type: 'message',
          title: activeConv.type === 'group' ? (activeConv.name || 'Group') : currentUser.name,
          body: text.slice(0, 100),
          conversationId: activeConv.id,
          fromUserId: currentUser.id,
          fromUserName: currentUser.name,
        })
      } catch {
        // Notification failure is non-fatal — message was already sent
      }
    }
  }

  const handleAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeConv || !e.target.files?.[0]) return
    const file = e.target.files[0]
    if (file.size > 1024 * 1024) {
      alert('File must be under 1 MB')
      return
    }
    const data = await fileToBase64(file)
    await sendMessage(activeConv.id, currentUser.id, currentUser.name, undefined, {
      name: file.name,
      data,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    })
    const others = activeConv.participants.filter((p) => p !== currentUser.id)
    for (const uid of others) {
      try {
        await createNotification({
          userId: uid,
          type: 'attachment',
          title: activeConv.type === 'group' ? (activeConv.name || 'Group') : currentUser.name,
          body: `Sent file: ${file.name}`,
          conversationId: activeConv.id,
          fromUserId: currentUser.id,
          fromUserName: currentUser.name,
        })
      } catch {
        // Notification failure is non-fatal
      }
    }
    e.target.value = ''
  }

  const handleDeleteConv = async (convId: string) => {
    if (!confirm('Delete this conversation and all messages?')) return
    await deleteConversation(convId)
    if (activeConv?.id === convId) clearActiveConv()
  }

  const filteredConvs = conversations.filter((c) => {
    if (!convSearch.trim()) return true
    return getConvDisplayName(c).toLowerCase().includes(convSearch.toLowerCase())
  })

  const filteredUsers = otherUsers.filter((u) => {
    if (!userSearch.trim()) return true
    return u.name.toLowerCase().includes(userSearch.toLowerCase())
  })

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const formatMsgTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        className="chat-fab"
        onClick={() => { if (!isOpen) setUnreadCount(0); setIsOpen(!isOpen) }}
        title={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? <Icons8Icon name="cancel" size={22} /> : <Icons8Icon name="chat" size={22} />}
        {!isOpen && unreadCount > 0 && (
          <span className="chat-fab-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* Popup Window */}
      {isOpen && (
        <div className="chat-popup">
          <div className="chat-popup-header">
            <h4>
              <Icons8Icon name="chat" size={16} />
              Chat
            </h4>
            <div className="chat-popup-header-actions">
              <button className="msg-icon-btn" onClick={() => setShowNewChat(true)} title="New chat">
                <Icons8Icon name="plus" size={15} />
              </button>
              <button className="msg-icon-btn" onClick={() => setShowNewGroup(true)} title="New group">
                <Icons8Icon name="group" size={15} />
              </button>
              <button className="msg-icon-btn" onClick={() => setIsOpen(false)} title="Minimize">
                <Icons8Icon name="collapse" size={15} />
              </button>
            </div>
          </div>

          {/* Conversation list or chat view */}
          {!activeConv && !showNewChat && !showNewGroup ? (
            <div className="chat-popup-body">
              <div className="msg-search-bar">
                <Icons8Icon name="search" size={13} />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                />
              </div>
              <div className="chat-popup-convs">
                {filteredConvs.length === 0 && (
                  <div className="msg-empty">No conversations yet. Start a new chat!</div>
                )}
                {filteredConvs.map((conv) => (
                  <div
                    key={conv.id}
                    className="msg-conv-item"
                    onClick={() => setActiveConv(conv)}
                  >
                    <span className={`msg-conv-avatar ${conv.type === 'group' ? 'msg-avatar-group' : ''}`}>
                      {getConvAvatar(conv)}
                    </span>
                    <div className="msg-conv-info">
                      <div className="msg-conv-name">{getConvDisplayName(conv)}</div>
                      {conv.lastMessage && (
                        <div className="msg-conv-preview">{conv.lastMessage}</div>
                      )}
                    </div>
                    <div className="msg-conv-meta">
                      {conv.lastMessageAt && (
                        <span className="msg-conv-time">{formatTime(conv.lastMessageAt)}</span>
                      )}
                      <button
                        className="msg-conv-delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id) }}
                        title="Delete"
                      >
                        <Icons8Icon name="trash" size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeConv ? (
            /* Active chat view */
            <div className="chat-popup-body chat-popup-chat">
              <div className="chat-popup-chat-header">
                <button className="chat-popup-back" onClick={clearActiveConv}>
                  <Icons8Icon name="back" size={16} />
                </button>
                <span className={`msg-conv-avatar msg-avatar-sm ${activeConv.type === 'group' ? 'msg-avatar-group' : ''}`}>
                  {getConvAvatar(activeConv)}
                </span>
                <div className="chat-popup-chat-info">
                  <div className="msg-conv-name">{getConvDisplayName(activeConv)}</div>
                  {activeConv.type === 'group' && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                      {activeConv.participants.length} members
                    </div>
                  )}
                </div>
                {activeConv.type === 'direct' && onStartCall && (
                  <div className="chat-popup-call-actions">
                    <button
                      className="msg-icon-btn"
                      onClick={() => {
                        const otherId = activeConv.participants.find((p) => p !== currentUser.id)
                        if (otherId) onStartCall(otherId, activeConv.participantNames[otherId] || 'User', 'audio')
                      }}
                      title="Voice call"
                    >
                      <Icons8Icon name="phone" size={14} />
                    </button>
                    <button
                      className="msg-icon-btn"
                      onClick={() => {
                        const otherId = activeConv.participants.find((p) => p !== currentUser.id)
                        if (otherId) onStartCall(otherId, activeConv.participantNames[otherId] || 'User', 'video')
                      }}
                      title="Video call"
                    >
                      <Icons8Icon name="video-call" size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="chat-popup-messages">
                {messages.map((msg) => {
                  const isMine = msg.senderId === currentUser.id
                  return (
                    <div key={msg.id} className={`msg-bubble-row ${isMine ? 'msg-mine' : 'msg-theirs'}`}>
                      <div className={`msg-bubble ${isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs'}`}>
                        {!isMine && activeConv.type === 'group' && (
                          <div className="msg-sender-name">{msg.senderName}</div>
                        )}
                        {msg.text && <div className="msg-text">{msg.text}</div>}
                        {msg.attachmentName && (
                          <div className="msg-attachment">
                            {msg.attachmentMimeType?.startsWith('image/') ? (
                              <div className="msg-attachment-image">
                                <img src={msg.attachmentData} alt={msg.attachmentName} />
                              </div>
                            ) : (
                              <div className="msg-attachment-file">
                                <Icons8Icon name="pdf" size={14} />
                                <span>{msg.attachmentName}</span>
                              </div>
                            )}
                            {msg.attachmentData && (
                              <a
                                href={msg.attachmentData}
                                download={msg.attachmentName}
                                className="msg-attachment-download"
                              >
                                <Icons8Icon name="download" size={12} /> Download
                              </a>
                            )}
                          </div>
                        )}
                        <div className="msg-time">{formatMsgTime(msg.createdAt)}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-popup-input-bar">
                <button className="msg-icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
                  <Icons8Icon name="paperclip" size={14} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleAttachment}
                />
                <AutoResizeTextarea
                  className="msg-input msg-textarea chat-popup-textarea"
                  placeholder="Type a message..."
                  value={draft}
                  onValueChange={setDraft}
                  minRows={1}
                  maxRows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <button
                  className="msg-send-btn chat-popup-send"
                  onClick={handleSend}
                  disabled={!draft.trim()}
                >
                  <Icons8Icon name="send" size={14} />
                </button>
              </div>
            </div>
          ) : null}

          {/* New Direct Chat */}
          {showNewChat && (
            <div className="chat-popup-body">
              <div className="chat-popup-sub-header">
                <button className="chat-popup-back" onClick={() => { setShowNewChat(false); setUserSearch(''); setChatError(null) }}>
                  <Icons8Icon name="back" size={16} />
                </button>
                <h5>New Chat</h5>
              </div>
              <div className="msg-search-bar">
                <Icons8Icon name="search" size={13} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {chatError && <div className="msg-empty" style={{ color: '#ef4444' }}>{chatError}</div>}
              <div className="chat-popup-convs">
                {usersLoading ? (
                  <div className="msg-empty">Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="msg-empty">No users found</div>
                ) : (
                  filteredUsers.map((user) => (
                    <button key={user.id} className="msg-user-item" onClick={() => startDirectChat(user)}>
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="msg-user-avatar" />
                      ) : (
                        <span className="msg-user-avatar msg-user-avatar-fallback">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="msg-user-info">
                        <div className="msg-user-name">{user.name}</div>
                        {user.organization && <div className="msg-user-org">{user.organization}</div>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* New Group Chat */}
          {showNewGroup && (
            <div className="chat-popup-body">
              <div className="chat-popup-sub-header">
                <button className="chat-popup-back" onClick={() => { setShowNewGroup(false); setUserSearch(''); setSelectedUsers([]); setGroupName('') }}>
                  <Icons8Icon name="back" size={16} />
                </button>
                <h5>New Group</h5>
              </div>
              <div style={{ padding: '0.5rem 0.75rem 0' }}>
                <input
                  type="text"
                  className="msg-input"
                  placeholder="Group name..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  autoFocus
                  style={{ fontSize: '0.8rem' }}
                />
              </div>
              <div className="msg-search-bar">
                <Icons8Icon name="search" size={13} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              {selectedUsers.length > 0 && (
                <div className="msg-selected-users" style={{ padding: '0 0.75rem' }}>
                  {selectedUsers.map((uid) => {
                    const u = allUsers.find((u2) => u2.id === uid)
                    return (
                      <span key={uid} className="msg-selected-chip">
                        {u?.name || uid}
                        <button onClick={() => setSelectedUsers((s) => s.filter((x) => x !== uid))}>
                          <Icons8Icon name="cancel" size={9} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="chat-popup-convs">
                {usersLoading ? (
                  <div className="msg-empty">Loading users…</div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUsers.includes(user.id)
                    return (
                      <button
                        key={user.id}
                        className={`msg-user-item ${isSelected ? 'msg-user-selected' : ''}`}
                        onClick={() => {
                          setSelectedUsers((s) =>
                            isSelected ? s.filter((x) => x !== user.id) : [...s, user.id],
                          )
                        }}
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="msg-user-avatar" />
                        ) : (
                          <span className="msg-user-avatar msg-user-avatar-fallback">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="msg-user-info">
                          <div className="msg-user-name">{user.name}</div>
                          {user.organization && <div className="msg-user-org">{user.organization}</div>}
                        </div>
                        {isSelected && <span className="msg-check">&#10003;</span>}
                      </button>
                    )
                  })
                )}
              </div>
              {selectedUsers.length > 0 && (
                <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--color-border-light)' }}>
                  <button
                    className="msg-create-btn"
                    disabled={!groupName.trim() || selectedUsers.length === 0}
                    onClick={handleCreateGroup}
                    style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
                  >
                    Create Group ({selectedUsers.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
