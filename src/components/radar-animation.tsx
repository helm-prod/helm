'use client'

import { useEffect, useRef } from 'react'

interface RadarAnimationProps {
  size?: number
  className?: string
}

export function RadarAnimation({ size = 100, className = '' }: RadarAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx!.scale(dpr, dpr)

    let angle = 0
    const cx = size / 2
    const cy = size / 2
    const maxR = size / 2 - 4

    const blips = [
      { a: 0.8, r: 0.6 },
      { a: 2.1, r: 0.35 },
      { a: 3.9, r: 0.78 },
      { a: 5.2, r: 0.5 },
      { a: 1.4, r: 0.85 },
      { a: 4.5, r: 0.25 },
    ]

    function draw() {
      ctx!.clearRect(0, 0, size, size)

      // Outer ring
      ctx!.beginPath()
      ctx!.arc(cx, cy, maxR, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.3)'
      ctx!.lineWidth = 1.5
      ctx!.stroke()

      // Inner rings
      for (let i = 1; i <= 3; i++) {
        ctx!.beginPath()
        ctx!.arc(cx, cy, maxR * (i / 4), 0, Math.PI * 2)
        ctx!.strokeStyle = `rgba(207, 167, 81, ${0.08 + i * 0.04})`
        ctx!.lineWidth = 0.75
        ctx!.stroke()
      }

      // Crosshairs
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.12)'
      ctx!.lineWidth = 0.5
      ctx!.beginPath()
      ctx!.moveTo(cx, cy - maxR)
      ctx!.lineTo(cx, cy + maxR)
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.moveTo(cx - maxR, cy)
      ctx!.lineTo(cx + maxR, cy)
      ctx!.stroke()

      // Diagonal crosshairs
      const d = maxR * 0.707
      ctx!.beginPath()
      ctx!.moveTo(cx - d, cy - d)
      ctx!.lineTo(cx + d, cy + d)
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.moveTo(cx + d, cy - d)
      ctx!.lineTo(cx - d, cy + d)
      ctx!.stroke()

      // Sweep cone (gradient trailing the line)
      const sweepWidth = 0.5
      const gradient = ctx!.createConicGradient(angle - sweepWidth, cx, cy)
      gradient.addColorStop(0, 'rgba(207, 167, 81, 0)')
      gradient.addColorStop(0.06, 'rgba(207, 167, 81, 0.25)')
      gradient.addColorStop(0.08, 'rgba(207, 167, 81, 0)')
      ctx!.beginPath()
      ctx!.moveTo(cx, cy)
      ctx!.arc(cx, cy, maxR, angle - sweepWidth, angle)
      ctx!.closePath()
      ctx!.fillStyle = gradient
      ctx!.fill()

      // Leading sweep line
      ctx!.beginPath()
      ctx!.moveTo(cx, cy)
      ctx!.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR)
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.7)'
      ctx!.lineWidth = 1.5
      ctx!.stroke()

      // Blips that appear when sweep passes
      blips.forEach((blip) => {
        let diff = angle - blip.a
        while (diff < 0) diff += Math.PI * 2
        while (diff > Math.PI * 2) diff -= Math.PI * 2
        const fadeTime = 4.0
        if (diff < fadeTime) {
          const alpha = (1 - diff / fadeTime) * 0.9
          const bx = cx + Math.cos(blip.a) * maxR * blip.r
          const by = cy + Math.sin(blip.a) * maxR * blip.r
          const glow = ctx!.createRadialGradient(bx, by, 0, bx, by, 6)
          glow.addColorStop(0, `rgba(207, 167, 81, ${alpha})`)
          glow.addColorStop(1, 'rgba(207, 167, 81, 0)')
          ctx!.beginPath()
          ctx!.arc(bx, by, 6, 0, Math.PI * 2)
          ctx!.fillStyle = glow
          ctx!.fill()
          ctx!.beginPath()
          ctx!.arc(bx, by, 2, 0, Math.PI * 2)
          ctx!.fillStyle = `rgba(207, 167, 81, ${alpha})`
          ctx!.fill()
        }
      })

      // Center dot
      ctx!.beginPath()
      ctx!.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(207, 167, 81, 0.9)'
      ctx!.fill()

      angle += 0.02
      if (angle > Math.PI * 2) angle -= Math.PI * 2
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
    />
  )
}

// Compact version for sidebar
export function MiniRadar({ size = 36 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx!.scale(dpr, dpr)

    let angle = 0
    const cx = size / 2
    const cy = size / 2
    const maxR = size / 2 - 2

    function draw() {
      ctx!.clearRect(0, 0, size, size)

      // Outer ring
      ctx!.beginPath()
      ctx!.arc(cx, cy, maxR, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.4)'
      ctx!.lineWidth = 1.5
      ctx!.stroke()

      // Inner ring
      ctx!.beginPath()
      ctx!.arc(cx, cy, maxR * 0.5, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.15)'
      ctx!.lineWidth = 0.5
      ctx!.stroke()

      // Crosshairs
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.1)'
      ctx!.lineWidth = 0.5
      ctx!.beginPath()
      ctx!.moveTo(cx, cy - maxR)
      ctx!.lineTo(cx, cy + maxR)
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.moveTo(cx - maxR, cy)
      ctx!.lineTo(cx + maxR, cy)
      ctx!.stroke()

      // Sweep cone
      ctx!.beginPath()
      ctx!.moveTo(cx, cy)
      ctx!.arc(cx, cy, maxR, angle - 0.4, angle)
      ctx!.closePath()
      const grad = ctx!.createConicGradient(angle - 0.4, cx, cy)
      grad.addColorStop(0, 'rgba(207, 167, 81, 0)')
      grad.addColorStop(0.08, 'rgba(207, 167, 81, 0.3)')
      grad.addColorStop(0.1, 'rgba(207, 167, 81, 0)')
      ctx!.fillStyle = grad
      ctx!.fill()

      // Leading line
      ctx!.beginPath()
      ctx!.moveTo(cx, cy)
      ctx!.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR)
      ctx!.strokeStyle = 'rgba(207, 167, 81, 0.8)'
      ctx!.lineWidth = 1
      ctx!.stroke()

      // Center
      ctx!.beginPath()
      ctx!.arc(cx, cy, 1.5, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(207, 167, 81, 0.9)'
      ctx!.fill()

      angle += 0.025
      if (angle > Math.PI * 2) angle -= Math.PI * 2
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
    />
  )
}
