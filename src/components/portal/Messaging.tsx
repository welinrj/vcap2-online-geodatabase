import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare,
  Send,
  Plus,
  Users,
  Paperclip,
  ArrowLeft,
  Phone,
  Video,
  X,
  Search,
  Download,
  FileText,
  Trash2,
} from 'lucide-react'
import type { UserProfile } from '../../types/user'
import type { Conversation, Message } from '../../types/messaging'
import {
  createConversation,
  findDirectConversation,
  onConversationsChanged,
  onMessagesChanged,
  sendMessage,
  deleteConversation,
  createNotification,
} from '../../services/messagingStore'
import { listUsers } from '../../services/userStore'
import { playMessageSound, playAttachmentSound } from '../../services/notificationSounds'
import { AutoResizeTextarea } from '../ui/auto-resize-textarea'

interface MessagingProps {
  currentUser: UserProfile | null
  onStartCall?: (calleeId: string, calleeName: string, type: 'video' | 'audio') => void
}

export default function Messaging({ currentUser, onStartCall }: MessagingProps) {
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevMsgCount = useRef(0)

  const clearActiveConv = useCallback(() => {
    setActiveConv(null)
    setMessages([])
    prevMsgCount.current = 0
  }, [])

  // Load users only when needed (new chat or group modal opened)
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
    if (!currentUser) return
    return onConversationsChanged(currentUser.id, setConversations)
  }, [currentUser])

  const activeConvId = activeConv?.id ?? null

  // Subscribe to messages for active conversation
  useEffect(() => {
    if (!activeConvId) {
      return
    }
    return onMessagesChanged(activeConvId, (msgs) => {
      setMessages(msgs)
      // Play sound for new messages from others
      if (
        msgs.length > prevMsgCount.current &&
        prevMsgCount.current > 0 &&
        currentUser
      ) {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg.senderId !== currentUser.id) {
          try {
            if (lastMsg.attachmentName) {
              playAttachmentSound()
            } else {
              playMessageSound()
            }
          } catch {
            // Audio playback may fail if user hasn't interacted with page yet
          }
        }
      }
      prevMsgCount.current = msgs.length
    })
  }, [activeConvId, currentUser])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const otherUsers = allUsers.filter((u) => u.id !== currentUser?.id)

  const getConvDisplayName = useCallback(
    (conv: Conversation): string => {
      if (conv.type === 'group') return conv.name || 'Group Chat'
      if (!currentUser) return 'Chat'
      const otherId = conv.participants.find((p) => p !== currentUser.id)
      return otherId ? (conv.participantNames[otherId] || 'User') : 'Chat'
    },
    [currentUser],
  )

  const getConvAvatar = useCallback(
    (conv: Conversation): string => {
      if (conv.type === 'group') return 'G'
      if (!currentUser) return '?'
      const otherId = conv.participants.find((p) => p !== currentUser.id)
      const name = otherId ? (conv.participantNames[otherId] || '?') : '?'
      return name.charAt(0).toUpperCase()
    },
    [currentUser],
  )

  // Start direct chat
  const startDirectChat = async (user: UserProfile) => {
    if (!currentUser) return
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

  // Create group chat
  const handleCreateGroup = async () => {
    if (!currentUser || selectedUsers.length === 0 || !groupName.trim()) return
    const participants = [currentUser.id, ...selectedUsers]
    const names: Record<string, string> = { [currentUser.id]: currentUser.name }
    selectedUsers.forEach((uid) => {
      const u = allUsers.find((u2) => u2.id === uid)
      if (u) names[uid] = u.name
    })
    const conv = await createConversation('group', participants, names, currentUser.id, groupName.trim())
    // Notify group members
    for (const uid of selectedUsers) {
      await createNotification({
        userId: uid,
        type: 'group_invite',
        title: 'Added to group',
        body: `${currentUser.name} added you to "${groupName.trim()}"`,
        conversationId: conv.id,
        fromUserId: currentUser.id,
        fromUserName: currentUser.name,
      })
    }
    setActiveConv(conv)
    setShowNewGroup(false)
    setGroupName('')
    setSelectedUsers([])
  }

  // Send text message
  const handleSend = async () => {
    if (!currentUser || !activeConv || !draft.trim()) return
    const text = draft.trim()
    setDraft('')
    await sendMessage(activeConv.id, currentUser.id, currentUser.name, text)
    // Notify other participants (non-blocking — failed notifications shouldn't affect UX)
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

  // Send attachment
  const handleAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser || !activeConv || !e.target.files?.[0]) return
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
    // Notify
    const others = activeConv.participants.filter((p) => p !== currentUser.id)
    for (const uid of others) {
      await createNotification({
        userId: uid,
        type: 'attachment',
        title: activeConv.type === 'group' ? (activeConv.name || 'Group') : currentUser.name,
        body: `Sent file: ${file.name}`,
        conversationId: activeConv.id,
        fromUserId: currentUser.id,
        fromUserName: currentUser.name,
      })
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

  if (!currentUser) return null

  return (
    <div className="msg-container">
      {/* Conversation List */}
      <div className={`msg-sidebar ${activeConv ? 'msg-sidebar-hidden-mobile' : ''}`}>
        <div className="msg-sidebar-header">
          <h3><MessageSquare size={18} /> Messages</h3>
          <div className="msg-sidebar-actions">
            <button className="msg-icon-btn" onClick={() => setShowNewChat(true)} title="New chat">
              <Plus size={16} />
            </button>
            <button className="msg-icon-btn" onClick={() => setShowNewGroup(true)} title="New group">
              <Users size={16} />
            </button>
          </div>
        </div>

        <div className="msg-search-bar">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={convSearch}
            onChange={(e) => setConvSearch(e.target.value)}
          />
        </div>

        <div className="msg-conv-list">
          {filteredConvs.length === 0 && (
            <div className="msg-empty">No conversations yet. Start a new chat!</div>
          )}
          {filteredConvs.map((conv) => (
            <div
              key={conv.id}
              className={`msg-conv-item ${activeConv?.id === conv.id ? 'active' : ''}`}
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
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat View */}
      <div className={`msg-chat ${!activeConv ? 'msg-chat-hidden-mobile' : ''}`}>
        {activeConv ? (
          <>
            <div className="msg-chat-header">
              <button className="msg-back-btn" onClick={clearActiveConv}>
                <ArrowLeft size={18} />
              </button>
              <span className={`msg-conv-avatar msg-avatar-sm ${activeConv.type === 'group' ? 'msg-avatar-group' : ''}`}>
                {getConvAvatar(activeConv)}
              </span>
              <div className="msg-chat-header-info">
                <div className="msg-chat-header-name">{getConvDisplayName(activeConv)}</div>
                {activeConv.type === 'group' && (
                  <div className="msg-chat-header-members">
                    {activeConv.participants.length} members
                  </div>
                )}
              </div>
              {activeConv.type === 'direct' && onStartCall && (
                <div className="msg-chat-header-actions">
                  <button
                    className="msg-icon-btn"
                    onClick={() => {
                      const otherId = activeConv.participants.find((p) => p !== currentUser.id)
                      if (otherId) {
                        onStartCall(otherId, activeConv.participantNames[otherId] || 'User', 'audio')
                      }
                    }}
                    title="Voice call"
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    className="msg-icon-btn"
                    onClick={() => {
                      const otherId = activeConv.participants.find((p) => p !== currentUser.id)
                      if (otherId) {
                        onStartCall(otherId, activeConv.participantNames[otherId] || 'User', 'video')
                      }
                    }}
                    title="Video call"
                  >
                    <Video size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="msg-messages">
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
                              <FileText size={16} />
                              <span>{msg.attachmentName}</span>
                            </div>
                          )}
                          {msg.attachmentData && (
                            <a
                              href={msg.attachmentData}
                              download={msg.attachmentName}
                              className="msg-attachment-download"
                            >
                              <Download size={14} /> Download
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

            <div className="msg-input-bar">
              <button className="msg-icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
                <Paperclip size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleAttachment}
              />
              <AutoResizeTextarea
                className="msg-input msg-textarea"
                placeholder="Type a message..."
                value={draft}
                onValueChange={setDraft}
                minRows={1}
                maxRows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                className="msg-send-btn"
                onClick={handleSend}
                disabled={!draft.trim()}
              >
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="msg-no-chat">
            <MessageSquare size={48} strokeWidth={1} />
            <p>Select a conversation or start a new chat</p>
          </div>
        )}
      </div>

      {/* New Direct Chat Modal */}
      {showNewChat && (
        <div className="msg-modal-overlay" onClick={() => { setShowNewChat(false); setChatError(null) }}>
          <div className="msg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msg-modal-header">
              <h4>New Chat</h4>
              <button className="msg-icon-btn" onClick={() => { setShowNewChat(false); setChatError(null) }}>
                <X size={16} />
              </button>
            </div>
            <div className="msg-search-bar">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                autoFocus
              />
            </div>
            {chatError && <div className="msg-empty" style={{ color: '#ef4444' }}>{chatError}</div>}
            <div className="msg-user-list">
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
        </div>
      )}

      {/* New Group Chat Modal */}
      {showNewGroup && (
        <div className="msg-modal-overlay" onClick={() => setShowNewGroup(false)}>
          <div className="msg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msg-modal-header">
              <h4>New Group Chat</h4>
              <button className="msg-icon-btn" onClick={() => setShowNewGroup(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '0.75rem 1rem' }}>
              <input
                type="text"
                className="msg-input"
                placeholder="Group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="msg-search-bar">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
            {selectedUsers.length > 0 && (
              <div className="msg-selected-users">
                {selectedUsers.map((uid) => {
                  const u = allUsers.find((u2) => u2.id === uid)
                  return (
                    <span key={uid} className="msg-selected-chip">
                      {u?.name || uid}
                      <button onClick={() => setSelectedUsers((s) => s.filter((x) => x !== uid))}>
                        <X size={10} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            <div className="msg-user-list">
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
            <div className="msg-modal-footer">
              <button
                className="msg-create-btn"
                disabled={!groupName.trim() || selectedUsers.length === 0}
                onClick={handleCreateGroup}
              >
                Create Group ({selectedUsers.length} members)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
