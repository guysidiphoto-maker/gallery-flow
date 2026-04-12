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
  return (
    <nav className={`lp-nav lp-nav--solid-always${scrolled ? ' lp-nav--solid' : ''}`}>
      <div className="lp-nav-inner">
        <a href="/" className="lp-logo">Pixflow</a>
        <div className="lp-nav-links-desktop">
          <a href="/#features" className="lp-nav-link">Features</a>
          <a href="/#pricing" className="lp-nav-link">Pricing</a>
          <a href="/demo" className="lp-nav-link">Demo</a>
          <a href="#" className="lp-nav-link">Download</a>
          <a href="#" className="lp-nav-link">Sign in</a>
        </div>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-bottom">
          <p>&copy; 2026 Pixflow. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export function PrivacyPage() {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div className="lp-root">
      <Nav />
      <section className="lp-legal">
        <div className="lp-container lp-legal-container">
          <h1>Privacy Policy</h1>
          <p className="lp-legal-date">Effective date: April 2026</p>

          <h2>1. What Data We Collect</h2>
          <p>We collect the following categories of information:</p>
          <ul>
            <li><strong>Account information:</strong> Your name, email address, and payment details when you create an account or subscribe to a paid plan.</li>
            <li><strong>Photos and content:</strong> The photographs and gallery content you upload through the Pixflow application for hosting and delivery.</li>
            <li><strong>Usage analytics:</strong> Anonymized data about how you use the application, including feature usage, gallery views, and performance metrics. We use this to improve the product.</li>
            <li><strong>Device information:</strong> Basic information about your Mac (OS version, app version) for compatibility and troubleshooting purposes.</li>
          </ul>

          <h2>2. How We Use Your Data</h2>
          <p>We use your data to:</p>
          <ul>
            <li>Provide and maintain the Service, including hosting and delivering your galleries.</li>
            <li>Process payments and manage your subscription.</li>
            <li>Send you important service-related communications (billing confirmations, security alerts, feature updates).</li>
            <li>Improve and develop new features based on aggregated, anonymized usage patterns.</li>
            <li>Provide customer support when you contact us.</li>
          </ul>

          <h2>3. Data Storage and Security</h2>
          <p>
            Your data is stored on infrastructure provided by Supabase and AWS. All data is encrypted at rest
            and in transit using industry-standard encryption protocols (TLS 1.2+ for transit, AES-256 for
            storage). We implement appropriate technical and organizational measures to protect your data
            against unauthorized access, alteration, disclosure, or destruction.
          </p>

          <h2>4. Third-Party Services</h2>
          <p>We use the following third-party services to operate Pixflow:</p>
          <ul>
            <li><strong>Supabase:</strong> Database and authentication infrastructure.</li>
            <li><strong>Vercel:</strong> Web hosting for published gallery pages.</li>
            <li><strong>Payment provider:</strong> For processing subscription payments. We do not store your full credit card details on our servers.</li>
          </ul>
          <p>
            Each third-party provider has their own privacy policy. We only share the minimum data necessary
            for them to provide their services.
          </p>

          <h2>5. Your Photos</h2>
          <p>
            You retain full ownership of all photographs and content you upload to Pixflow. We will never use
            your photos for marketing, advertising, AI model training, or any purpose other than providing the
            Service to you. When you delete a gallery or your account, your photos are permanently removed from
            our servers within 30 days.
          </p>

          <h2>6. Guest Data</h2>
          <p>
            When your clients view a published gallery, we collect minimal data: the pages they visit and basic
            browser information for analytics. We do not track gallery visitors across other websites, do not
            use third-party advertising trackers, and do not sell or share guest browsing data with any third
            party.
          </p>

          <h2>7. Cookies</h2>
          <p>
            The Pixflow web application uses essential cookies required for the Service to function (such as
            authentication tokens and gallery password sessions). We do not use advertising cookies or
            third-party tracking cookies. Gallery viewers may receive a session cookie if the gallery is
            password-protected.
          </p>

          <h2>8. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. If you cancel your account, we
            will delete your personal data and photos within 30 days, except where we are required by law to
            retain certain records (such as billing history, which we retain for up to 7 years for tax
            compliance).
          </p>

          <h2>9. Your Rights</h2>
          <p>
            Under GDPR and other applicable privacy laws, you have the right to:
          </p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Delete:</strong> Request deletion of your personal data and account.</li>
            <li><strong>Export:</strong> Request a machine-readable export of your data.</li>
            <li><strong>Rectify:</strong> Request correction of inaccurate personal data.</li>
            <li><strong>Restrict:</strong> Request restriction of processing of your personal data.</li>
            <li><strong>Object:</strong> Object to processing of your personal data for certain purposes.</li>
          </ul>
          <p>
            To exercise any of these rights, please contact us at{' '}
            <a href="mailto:privacy@pixflow-ai.com">privacy@pixflow-ai.com</a>. We will respond to your
            request within 30 days.
          </p>

          <h2>10. Children's Privacy</h2>
          <p>
            Pixflow is not intended for use by individuals under the age of 18. We do not knowingly collect
            personal data from children. If you believe we have collected data from a child, please contact
            us and we will promptly delete it.
          </p>

          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we make material changes, we will
            notify you by email at least 30 days before the changes take effect. The "Effective date" at
            the top of this page indicates when the policy was last updated.
          </p>

          <h2>12. Contact</h2>
          <p>
            If you have questions about this Privacy Policy or your data, please contact us at{' '}
            <a href="mailto:privacy@pixflow-ai.com">privacy@pixflow-ai.com</a>.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  )
}
