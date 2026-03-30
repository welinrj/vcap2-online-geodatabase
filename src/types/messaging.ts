export interface Conversation {
  id: string
  /** 'direct' = 1-on-1, 'group' = multi-user */
  type: 'direct' | 'group'
  /** Group name (only for group chats) */
  name?: string
  /** User IDs of all participants */
  participants: string[]
  /** Participant names keyed by user ID */
  participantNames: Record<string, string>
  createdBy: string
  createdAt: string
  /** Preview of the last message */
  lastMessage?: string
  lastMessageAt?: string
  lastMessageBy?: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  text?: string
  /** Attachment fields (base64-encoded, < 1MB) */
  attachmentName?: string
  attachmentData?: string
  attachmentMimeType?: string
  attachmentSize?: number
  createdAt: string
}

export type NotificationType = 'message' | 'call' | 'videocall' | 'attachment' | 'group_invite' | 'file_upload'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  conversationId?: string
  fromUserId?: string
  fromUserName?: string
  createdAt: string
}

export interface CallSignal {
  id: string
  callerId: string
  callerName: string
  callerAvatar?: string | null
  calleeId: string
  calleeName: string
  /** 'video' includes camera, 'audio' is voice only */
  type: 'video' | 'audio'
  status: 'ringing' | 'active' | 'ended' | 'declined'
  /** WebRTC SDP offer/answer */
  offer?: string
  answer?: string
  createdAt: string
}
