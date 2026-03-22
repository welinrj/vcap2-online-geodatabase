import { useState, useEffect, useRef, useCallback } from 'react'
import Icons8Icon from '../Icons8Icon'
import type { UserProfile } from '../../types/user'
import type { CallSignal } from '../../types/messaging'
import {
  createCall,
  setCallOffer,
  setCallAnswer,
  endCall,
  declineCall,
  addIceCandidate,
  onIceCandidates,
  onCallChanged,
} from '../../services/callService'
import { createNotification } from '../../services/messagingStore'
import { startRingtone, stopRingtone } from '../../services/notificationSounds'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

interface VideoCallProps {
  currentUser: UserProfile
  /** Set when initiating a call */
  outgoingCall?: { calleeId: string; calleeName: string; type: 'video' | 'audio' } | null
  /** Set when receiving an incoming call */
  incomingCall?: CallSignal | null
  onClose: () => void
}

export default function VideoCall({
  currentUser,
  outgoingCall,
  incomingCall,
  onClose,
}: VideoCallProps) {
  const [callId, setCallId] = useState<string | null>(null)
  const [callStatus, setCallStatus] = useState<'ringing' | 'active' | 'ended' | 'declined'>('ringing')
  const [isCaller, setIsCaller] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)
  const [callType, setCallType] = useState<'video' | 'audio'>('video')
  const [remoteName, setRemoteName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  const cleanup = useCallback(() => {
    stopRingtone()
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current = null
    screenStreamRef.current = null
  }, [])

  // Initialize call
  useEffect(() => {
    if (outgoingCall) {
      setIsCaller(true)
      setCallType(outgoingCall.type)
      setRemoteName(outgoingCall.calleeName)
      setVideoEnabled(outgoingCall.type === 'video')
      initiateCall(outgoingCall)
    } else if (incomingCall) {
      setIsCaller(false)
      setCallId(incomingCall.id)
      setCallType(incomingCall.type)
      setRemoteName(incomingCall.callerName)
      setVideoEnabled(incomingCall.type === 'video')
      setCallStatus('ringing')
      startRingtone()
    }

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initiateCall = async (call: { calleeId: string; calleeName: string; type: 'video' | 'audio' }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: call.type === 'video',
        audio: true,
      })
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream

      const cId = await createCall(
        currentUser.id,
        currentUser.name,
        currentUser.avatar,
        call.calleeId,
        call.calleeName,
        call.type,
      )
      setCallId(cId)

      // Create peer connection
      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcRef.current = pc

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addIceCandidate(cId, 'caller', event.candidate.toJSON())
        }
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }

      // Create and set offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await setCallOffer(cId, JSON.stringify(offer))

      // Listen for answer
      const unsub = onCallChanged(cId, (signal) => {
        if (!signal) {
          setCallStatus('ended')
          cleanup()
          return
        }
        setCallStatus(signal.status)
        if (signal.status === 'ended' || signal.status === 'declined') {
          cleanup()
        }
        if (signal.answer && pc.remoteDescription === null) {
          pc.setRemoteDescription(JSON.parse(signal.answer))
        }
      })
      cleanupRef.current.push(unsub)

      // Listen for ICE candidates from callee
      const unsubIce = onIceCandidates(cId, 'callee', (candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
      })
      cleanupRef.current.push(unsubIce)

      // Notify callee
      await createNotification({
        userId: call.calleeId,
        type: call.type === 'video' ? 'videocall' : 'call',
        title: `Incoming ${call.type} call`,
        body: `${currentUser.name} is calling you`,
        fromUserId: currentUser.id,
        fromUserName: currentUser.name,
      })

      startRingtone()
    } catch (err) {
      console.error('Failed to initiate call:', err)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMsg('Camera/microphone permission denied. Please allow access and try again.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setErrorMsg('No camera or microphone found on this device.')
      } else {
        setErrorMsg('Failed to start the call. Please try again.')
      }
      setCallStatus('ended')
    }
  }

  const answerCall = async () => {
    if (!incomingCall || !callId) return
    stopRingtone()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: incomingCall.type === 'video',
        audio: true,
      })
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream

      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcRef.current = pc

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addIceCandidate(callId, 'callee', event.candidate.toJSON())
        }
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }

      // Listen for call status changes
      const unsub = onCallChanged(callId, (signal) => {
        if (!signal || signal.status === 'ended') {
          setCallStatus('ended')
          cleanup()
        }
      })
      cleanupRef.current.push(unsub)

      // Listen for caller ICE candidates
      const unsubIce = onIceCandidates(callId, 'caller', (candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
      })
      cleanupRef.current.push(unsubIce)

      // Set remote offer and create answer
      const offer = incomingCall.offer
      if (offer) {
        await pc.setRemoteDescription(JSON.parse(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await setCallAnswer(callId, JSON.stringify(answer))
      }

      setCallStatus('active')
    } catch (err) {
      console.error('Failed to answer call:', err)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMsg('Camera/microphone permission denied. Please allow access and try again.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setErrorMsg('No camera or microphone found on this device.')
      } else {
        setErrorMsg('Failed to answer the call. Please try again.')
      }
      setCallStatus('ended')
    }
  }

  const handleHangup = async () => {
    if (callId) await endCall(callId)
    cleanup()
    setCallStatus('ended')
    onClose()
  }

  const handleDecline = async () => {
    if (callId) await declineCall(callId)
    stopRingtone()
    cleanup()
    onClose()
  }

  const toggleVideo = () => {
    const stream = localStreamRef.current
    if (stream) {
      stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled })
      setVideoEnabled((v) => !v)
    }
  }

  const toggleAudio = () => {
    const stream = localStreamRef.current
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
      setAudioEnabled((a) => !a)
    }
  }

  const toggleScreenShare = async () => {
    const pc = pcRef.current
    if (!pc) return

    if (screenSharing) {
      // Stop screen share, revert to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
      const camStream = localStreamRef.current
      if (camStream) {
        const videoTrack = camStream.getVideoTracks()[0]
        if (videoTrack) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) await sender.replaceTrack(videoTrack)
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = camStream
      }
      setScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(screenTrack)
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream
        screenTrack.onended = async () => {
          // Revert to camera directly instead of calling toggleScreenShare()
          // to avoid recursive state loops
          screenStreamRef.current?.getTracks().forEach((t) => t.stop())
          screenStreamRef.current = null
          const camStream = localStreamRef.current
          if (camStream) {
            const camTrack = camStream.getVideoTracks()[0]
            if (camTrack) {
              const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video')
              if (videoSender) await videoSender.replaceTrack(camTrack)
            }
            if (localVideoRef.current) localVideoRef.current.srcObject = camStream
          }
          setScreenSharing(false)
        }
        setScreenSharing(true)
      } catch {
        // User cancelled screen share
      }
    }
  }

  // Ringing UI for incoming call
  if (!isCaller && callStatus === 'ringing') {
    return (
      <div className="vc-overlay">
        <div className="vc-ringing-card">
          <div className="vc-ringing-pulse" />
          <div className="vc-ringing-avatar">
            {incomingCall?.callerAvatar ? (
              <img src={incomingCall.callerAvatar} alt="" />
            ) : (
              <span>{remoteName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <h3>{remoteName}</h3>
          <p>Incoming {callType} call...</p>
          <div className="vc-ringing-actions">
            <button className="vc-btn vc-btn-decline" onClick={handleDecline}>
              <Icons8Icon name="phone-disconnected" size={20} />
              <span>Decline</span>
            </button>
            <button className="vc-btn vc-btn-answer" onClick={answerCall}>
              <Icons8Icon name="phone" size={20} />
              <span>Answer</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Ended/Declined
  if (callStatus === 'ended' || callStatus === 'declined') {
    return (
      <div className="vc-overlay">
        <div className="vc-ringing-card">
          <h3>Call {callStatus === 'declined' ? 'Declined' : 'Ended'}</h3>
          {errorMsg && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0.5rem 0' }}>{errorMsg}</p>}
          <button className="vc-btn vc-btn-close" onClick={onClose}>
            <Icons8Icon name="cancel" size={16} /> Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="vc-overlay">
      <div className="vc-container">
        <div className="vc-header">
          <span>{remoteName} — {callStatus === 'ringing' ? 'Ringing...' : 'Connected'}</span>
          <button className="msg-icon-btn" onClick={handleHangup} title="Close">
            <Icons8Icon name="cancel" size={16} />
          </button>
        </div>
        <div className="vc-videos">
          <video
            ref={remoteVideoRef}
            className="vc-remote-video"
            autoPlay
            playsInline
          />
          <video
            ref={localVideoRef}
            className="vc-local-video"
            autoPlay
            playsInline
            muted
          />
          {callStatus === 'ringing' && isCaller && (
            <div className="vc-calling-overlay">
              <div className="vc-ringing-pulse" />
              <p>Calling {remoteName}...</p>
            </div>
          )}
        </div>
        <div className="vc-controls">
          <button
            className={`vc-ctrl-btn ${!audioEnabled ? 'vc-ctrl-off' : ''}`}
            onClick={toggleAudio}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? <Icons8Icon name="microphone" size={18} /> : <Icons8Icon name="no-microphone" size={18} />}
          </button>
          {callType === 'video' && (
            <button
              className={`vc-ctrl-btn ${!videoEnabled ? 'vc-ctrl-off' : ''}`}
              onClick={toggleVideo}
              title={videoEnabled ? 'Camera off' : 'Camera on'}
            >
              {videoEnabled ? <Icons8Icon name="video-call" size={18} /> : <Icons8Icon name="no-video" size={18} />}
            </button>
          )}
          {callType === 'video' && (
            <button
              className={`vc-ctrl-btn ${screenSharing ? 'vc-ctrl-active' : ''}`}
              onClick={toggleScreenShare}
              title={screenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {screenSharing ? <Icons8Icon name="monitor" size={18} /> : <Icons8Icon name="monitor" size={18} />}
            </button>
          )}
          <button className="vc-ctrl-btn vc-ctrl-hangup" onClick={handleHangup}>
            <Icons8Icon name="phone-disconnected" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
