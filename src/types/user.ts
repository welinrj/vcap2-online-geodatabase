export interface UserProfile {
  id: string
  name: string
  email?: string
  role?: 'admin' | 'editor' | 'viewer'
  organization?: string
  avatar?: string | null // base64 data URL
  createdAt: string
  lastLogin?: string
}
