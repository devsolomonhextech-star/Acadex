import { useEffect, useState } from 'react'
import {
  CheckCircleFilled, SafetyCertificateOutlined, TeamOutlined, WalletOutlined,
} from '@ant-design/icons'
import { HERO_SLIDES } from './heroSlides'

const ROTATE_MS = 5000

/**
 * The hero artwork: three vector scenes of a parent using the app, crossfading
 * every five seconds. Hovering or focusing the card pauses the rotation, the
 * dots jump to a scene, and reduced-motion users keep the first scene still.
 */
export function HeroCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const scene = HERO_SLIDES[index]

  useEffect(() => {
    if (paused) return
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(
      () => setIndex(current => (current + 1) % HERO_SLIDES.length),
      ROTATE_MS,
    )
    return () => window.clearInterval(timer)
  }, [paused])

  return (
    <div className="lp-hero-visual">
      <div
        className="lp-hero-card"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <span className="lp-hero-blob blue" aria-hidden="true" />
        <span className="lp-hero-blob violet" aria-hidden="true" />
        <span className="lp-hero-blob green" aria-hidden="true" />

        <div className="lp-hero-photo lp-hero-art">
          {HERO_SLIDES.map((item, slideIndex) => (
            <div
              key={item.id}
              className={`lp-hero-slide${slideIndex === index ? ' is-active' : ''}`}
              aria-hidden={slideIndex !== index}
            >
              <img
                src={item.img}
                alt={item.alt}
                style={{ objectPosition: item.position }}
                decoding="async"
                draggable={false}
              />
            </div>
          ))}
        </div>

        <div className="lp-hero-chip card" key={`card-${scene.id}`}>
          <span className="lp-hero-chip-icon"><TeamOutlined /></span>
          <div><strong>{scene.eyebrow}</strong><small>{scene.title}</small></div>
        </div>
        <div className="lp-hero-chip pill" key={`pill-${scene.id}`}>
          <CheckCircleFilled /> {scene.pill}
        </div>
        <span className="lp-hero-orb orb-shield" aria-hidden="true"><SafetyCertificateOutlined /></span>
        <span className="lp-hero-orb orb-wallet" aria-hidden="true"><WalletOutlined /></span>
          <div className="lp-hero-dots" role="tablist" aria-label="Preview the parent app">
          {HERO_SLIDES.map((item, dotIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={item.eyebrow}
              className={dotIndex === index ? 'is-active' : ''}
              onClick={() => setIndex(dotIndex)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
