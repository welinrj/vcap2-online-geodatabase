import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Gooey Text Morphing component inspired by 21st.dev / Victor Welander.
 * Uses SVG filter + blur to create a smooth "gooey" morph effect
 * between an array of text strings.
 */

interface GooeyTextMorphProps {
  texts: string[]
  morphTime?: number
  cooldownTime?: number
  className?: string
  textClassName?: string
}

export function GooeyTextMorph({
  texts,
  morphTime = 1.5,
  cooldownTime = 0.5,
  className,
  textClassName,
}: GooeyTextMorphProps) {
  const text1Ref = useRef<HTMLSpanElement>(null)
  const text2Ref = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (texts.length < 2) return

    let textIndex = texts.length - 1
    let time = new Date()
    let morph = 0
    let cooldown = cooldownTime

    const setMorph = (fraction: number) => {
      if (text1Ref.current && text2Ref.current) {
        text2Ref.current.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`
        text2Ref.current.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`

        const inv = 1 - fraction
        text1Ref.current.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`
        text1Ref.current.style.opacity = `${Math.pow(inv, 0.4) * 100}%`
      }
    }

    const doCooldown = () => {
      morph = 0
      if (text1Ref.current && text2Ref.current) {
        text2Ref.current.style.filter = ''
        text2Ref.current.style.opacity = '100%'
        text1Ref.current.style.filter = ''
        text1Ref.current.style.opacity = '0%'
      }
    }

    const doMorph = () => {
      morph -= cooldown
      cooldown = 0
      let fraction = morph / morphTime

      if (fraction > 1) {
        cooldown = cooldownTime
        fraction = 1
      }

      setMorph(fraction)
    }

    function animate() {
      rafRef.current = requestAnimationFrame(animate)
      const newTime = new Date()
      const shouldIncrementIndex = cooldown > 0
      const dt = (newTime.getTime() - time.getTime()) / 1000
      time = newTime

      cooldown -= dt

      if (cooldown <= 0) {
        if (shouldIncrementIndex) {
          textIndex = (textIndex + 1) % texts.length
          if (text1Ref.current && text2Ref.current) {
            text1Ref.current.textContent = texts[textIndex % texts.length]
            text2Ref.current.textContent = texts[(textIndex + 1) % texts.length]
          }
        }
        doMorph()
      } else {
        doCooldown()
      }
    }

    // Set initial text
    if (text1Ref.current && text2Ref.current) {
      text1Ref.current.textContent = texts[0]
      text2Ref.current.textContent = texts[1]
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [texts, morphTime, cooldownTime])

  if (texts.length === 0) return null
  if (texts.length === 1) {
    return (
      <span className={cn('text-4xl font-bold', textClassName)}>
        {texts[0]}
      </span>
    )
  }

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg className="absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="gooey-text-threshold">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="flex items-center justify-center"
        style={{ filter: 'url(#gooey-text-threshold)' }}
      >
        <span
          ref={text1Ref}
          className={cn(
            'absolute inline-block select-none text-center',
            textClassName,
          )}
        />
        <span
          ref={text2Ref}
          className={cn(
            'absolute inline-block select-none text-center',
            textClassName,
          )}
        />
      </div>
    </div>
  )
}
