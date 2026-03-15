export type UserRole = 'admin' | 'editor'

export interface UserProfile {
  id: string
  name: string
  email?: string
  role?: UserRole
  organization?: string
  avatar?: string | null // base64 data URL
  createdAt: string
  lastLogin?: string
}
