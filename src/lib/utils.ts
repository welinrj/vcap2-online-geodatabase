import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns true only on Safari (desktop or iOS), not Chrome/Android. */
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}
