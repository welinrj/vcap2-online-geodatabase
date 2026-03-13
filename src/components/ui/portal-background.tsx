import { useEffect, useRef } from 'react'

/**
 * Animated 3D grid/particle background for the VCAP2 portal.
 * Renders a subtle perspective grid with floating particles using Canvas 2D,
 * giving the portal a professional 3D depth appearance.
 */
export const PortalBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0
    let t = 0

    const particles: { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number }[] = []
    const PARTICLE_COUNT = 60

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize particles in 3D space
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002,
        vz: (Math.random() - 0.5) * 0.001,
        size: Math.random() * 2 + 0.5,
      })
    }

    const render = () => {
      const w = canvas.width
      const h = canvas.height
      t += 0.003

      ctx.clearRect(0, 0, w, h)

      // Draw subtle perspective grid
      ctx.save()
      const cx = w * 0.5
      const cy = h * 0.65
      const fov = 600

      // Horizontal grid lines receding into distance
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.03)'
      ctx.lineWidth = 1
      for (let row = 0; row < 20; row++) {
        const z = row * 0.15 + 0.3 + (t * 0.5) % 0.15
        const scale = fov / (fov + z * 400)
        const yPos = cy + (row * 40 - 100) * scale
        if (yPos > h || yPos < 0) continue

        ctx.beginPath()
        const leftX = cx - (w * 0.8) * scale
        const rightX = cx + (w * 0.8) * scale
        ctx.moveTo(leftX, yPos)
        ctx.lineTo(rightX, yPos)
        ctx.globalAlpha = Math.max(0, 0.6 - row * 0.03)
        ctx.stroke()
      }

      // Vertical grid lines with perspective convergence
      for (let col = -12; col <= 12; col++) {
        ctx.beginPath()
        ctx.globalAlpha = 0.02
        const nearScale = fov / (fov + 100)
        const farScale = fov / (fov + 3000)
        const nearX = cx + col * 80 * nearScale
        const farX = cx + col * 80 * farScale
        const nearY = cy + 300 * nearScale
        const farY = cy - 400 * farScale
        ctx.moveTo(nearX, nearY)
        ctx.lineTo(farX, farY)
        ctx.stroke()
      }
      ctx.restore()

      // Draw and connect particles
      ctx.save()
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.z += p.vz

        // Wrap around
        if (p.x > 1.2) p.x = -1.2
        if (p.x < -1.2) p.x = 1.2
        if (p.y > 1.2) p.y = -1.2
        if (p.y < -1.2) p.y = 1.2
        if (p.z > 2) p.z = 0.5
        if (p.z < 0.5) p.z = 2

        const scale = fov / (fov + p.z * 300)
        const sx = cx + p.x * w * 0.4 * scale
        const sy = cy + p.y * h * 0.3 * scale - Math.sin(t + i) * 10
        const r = p.size * scale

        // Glow
        const alpha = (1 - p.z / 2) * 0.4
        ctx.beginPath()
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34, 197, 94, ${alpha * 0.15})`
        ctx.fill()

        // Core dot
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`
        ctx.fill()

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const qScale = fov / (fov + q.z * 300)
          const qx = cx + q.x * w * 0.4 * qScale
          const qy = cy + q.y * h * 0.3 * qScale - Math.sin(t + j) * 10
          const dx = sx - qx
          const dy = sy - qy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.lineTo(qx, qy)
            ctx.strokeStyle = `rgba(34, 197, 94, ${(1 - dist / 150) * 0.06})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      ctx.restore()

      // Subtle radial vignette overlay
      const grad = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy * 0.7, w * 0.8)
      grad.addColorStop(0, 'rgba(34, 197, 94, 0.015)')
      grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.008)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
