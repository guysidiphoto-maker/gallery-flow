import React, { useState, useEffect } from 'react'
import '../landing.css'

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

function Nav() {
  const scrolled = useScrolled()
  const [menuOpen, setMenuOpen] = useState(false)

  const links = [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'Demo', href: '/demo' },
    { label: 'Download', href: '#' },
    { label: 'Sign in', href: '#' },
  ]

  return (
    <nav className={`lp-nav${scrolled ? ' lp-nav--solid' : ''} lp-nav--solid-always`}>
      <div className="lp-nav-inner">
        <a href="/" className="lp-logo">Pixflow</a>
        <div className="lp-nav-links-desktop">
          {links.map(l => (
            <a key={l.label} href={l.href} className="lp-nav-link">{l.label}</a>
          ))}
        </div>
        <button className="lp-nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
      {menuOpen && (
        <div className="lp-nav-mobile">
          {links.map(l => (
            <a key={l.label} href={l.href} className="lp-nav-link" onClick={() => setMenuOpen(false)}>{l.label}</a>
          ))}
        </div>
      )}
    </nav>
  )
}

const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div className="lp-footer-col">
            <h4 className="lp-footer-heading">Product</h4>
            <a href="/#features">Features</a>
            <a href="/#pricing">Pricing</a>
            <a href="#">Download</a>
            <a href="/demo">Demo</a>
          </div>
          <div className="lp-footer-col">
            <h4 className="lp-footer-heading">Company</h4>
            <a href="#">About</a>
            <a href="#">Contact</a>
          </div>
          <div className="lp-footer-col">
            <h4 className="lp-footer-heading">Legal</h4>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </div>
          <div className="lp-footer-col">
            <h4 className="lp-footer-heading">Social</h4>
            <a href="#">Twitter</a>
            <a href="#">Instagram</a>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <p>&copy; 2026 Pixflow. All rights reserved.</p>
          <p className="lp-footer-love">Made with &#9829; for photographers</p>
        </div>
      </div>
    </footer>
  )
}

export function DemoPage() {
  return (
    <div className="lp-root">
      <Nav />
      <section className="lp-demo">
        <div className="lp-container">
          <h1 className="lp-demo-title">See Pixflow in action</h1>
          <p className="lp-demo-sub">
            This is a real gallery published with Pixflow. Browse it, click photos, try the sections.
          </p>

          {/* Desktop: browser chrome mockup */}
          <div className="lp-demo-browser">
            <div className="lp-demo-browser-bar">
              <span className="lp-demo-dot" />
              <span className="lp-demo-dot" />
              <span className="lp-demo-dot" />
            </div>
            <iframe
              className="lp-demo-iframe"
              src="https://pixflow-ai.com/gallery/891727ea-8c8c-4495-acdc-292651ae8182"
              title="Pixflow Gallery Demo"
              allow="fullscreen"
            />
          </div>

          {/* Mobile: full-width iframe */}
          <div className="lp-demo-mobile">
            <iframe
              className="lp-demo-iframe"
              src="https://pixflow-ai.com/gallery/891727ea-8c8c-4495-acdc-292651ae8182"
              title="Pixflow Gallery Demo"
              allow="fullscreen"
            />
          </div>

          <div className="lp-demo-cta">
            <p>Your gallery can look like this.</p>
            <a href="#" className="lp-btn lp-btn--primary">Download Pixflow</a>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
