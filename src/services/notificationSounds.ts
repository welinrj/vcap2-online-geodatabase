/** Programmatic notification sounds using Web Audio API */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

/** Short "ding" for new messages */
export function playMessageSound(): void {
  try {
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Audio not supported or user hasn't interacted yet
  }
}

/** Rising tone for incoming call/videocall — plays repeatedly */
let ringtoneInterval: ReturnType<typeof setInterval> | null = null

function playRingtoneOnce(): void {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    // Two-tone ring
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(i === 0 ? 784 : 1046, now + i * 0.2)
      gain.gain.setValueAtTime(0, now + i * 0.2)
      gain.gain.linearRampToValueAtTime(0.35, now + i * 0.2 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.35)
      osc.start(now + i * 0.2)
      osc.stop(now + i * 0.2 + 0.35)
    }
  } catch {
    // Audio not supported
  }
}

export function startRingtone(): void {
  stopRingtone()
  playRingtoneOnce()
  ringtoneInterval = setInterval(playRingtoneOnce, 2000)
}

export function stopRingtone(): void {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval)
    ringtoneInterval = null
  }
}

/** Soft chime for receiving an attachment */
export function playAttachmentSound(): void {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    const notes = [523, 659, 784] // C5, E5, G5 ascending
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + i * 0.1)
      gain.gain.setValueAtTime(0.25, now + i * 0.1)
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.25)
      osc.start(now + i * 0.1)
      osc.stop(now + i * 0.1 + 0.25)
    })
  } catch {
    // Audio not supported
  }
}

/** General notification sound */
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // Audio not supported
  }
}
