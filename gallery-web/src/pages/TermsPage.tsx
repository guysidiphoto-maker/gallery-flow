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

export function TermsPage() {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div className="lp-root">
      <Nav />
      <section className="lp-legal">
        <div className="lp-container lp-legal-container">
          <h1>Terms of Service</h1>
          <p className="lp-legal-date">Effective date: April 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Pixflow application and related services ("Service"), you agree to be bound
            by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Pixflow is a desktop application for macOS that enables professional photographers to organize, curate,
            and publish client galleries online. The Service includes the desktop application, cloud hosting of
            published galleries, and related features such as AI Stories generation.
          </p>

          <h2>3. User Accounts and Responsibilities</h2>
          <p>
            You must provide accurate and complete information when creating an account. You are responsible for
            maintaining the confidentiality of your account credentials and for all activity that occurs under your
            account. You agree to notify us immediately of any unauthorized use of your account.
          </p>
          <p>
            You must be at least 18 years old to create an account and use the Service. By using the Service, you
            represent that you meet this age requirement.
          </p>

          <h2>4. Intellectual Property</h2>
          <p>
            You retain all ownership rights to the photographs and other content you upload to Pixflow. We do not
            claim any intellectual property rights over your content. By using the Service, you grant us a limited
            license to host, display, and transmit your content solely for the purpose of providing the Service
            to you and your clients.
          </p>
          <p>
            The Pixflow application, including its design, features, code, and documentation, is the intellectual
            property of Pixflow and is protected by applicable copyright and trademark laws. You may not copy,
            modify, distribute, or reverse-engineer any part of the application without our prior written consent.
          </p>

          <h2>5. Prohibited Uses</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Upload, share, or distribute content that is illegal, harmful, threatening, abusive, defamatory, or otherwise objectionable.</li>
            <li>Infringe upon the intellectual property rights of others.</li>
            <li>Distribute malware, viruses, or any other harmful software.</li>
            <li>Attempt to gain unauthorized access to our systems or other users' accounts.</li>
            <li>Use the Service for any purpose other than its intended use as a photography gallery platform.</li>
            <li>Resell or redistribute the Service without our written permission.</li>
          </ul>

          <h2>6. Questionnaires and Client Data Collection</h2>
          <p>
            The Service allows photographers ("Service Users") to create questionnaires and collect information
            from their clients ("End Users"). By filling out a questionnaire on Pixflow, End Users acknowledge
            and agree to the following:
          </p>
          <ul>
            <li>The information submitted (including name, phone number, email, and questionnaire responses) is collected on behalf of the Service User (the photographer) who created the questionnaire.</li>
            <li>Pixflow acts as a data processor on behalf of the Service User. The Service User is the data controller and is responsible for obtaining proper consent from their End Users.</li>
            <li>Submitted data is stored securely on our servers and is accessible only to the Service User who created the questionnaire and to Pixflow for the purpose of providing the Service.</li>
            <li>End Users may receive SMS messages or emails following questionnaire submission, if the Service User has enabled this feature. By submitting the questionnaire with the consent checkbox checked, the End User agrees to receive such communications.</li>
            <li>End Users may request deletion of their submitted data by contacting the Service User or by emailing <a href="mailto:privacy@pixflow-ai.com">privacy@pixflow-ai.com</a>.</li>
          </ul>
          <p>
            Service Users who create questionnaires agree to:
          </p>
          <ul>
            <li>Use the questionnaire feature only for legitimate business purposes related to their photography services.</li>
            <li>Not collect sensitive personal data (health information, political opinions, religious beliefs, etc.) through questionnaires.</li>
            <li>Comply with all applicable data protection laws (including GDPR, Israeli Privacy Protection Law) when collecting and processing End User data.</li>
            <li>Not sell, share, or transfer End User data to third parties without proper consent.</li>
          </ul>

          <h2>7. SMS and Email Communications</h2>
          <p>
            The Service may send SMS messages and/or emails to End Users on behalf of Service Users. These
            communications are sent only when:
          </p>
          <ul>
            <li>The Service User has enabled automatic messaging for a specific questionnaire.</li>
            <li>The End User has explicitly consented by checking the consent checkbox before submitting the questionnaire.</li>
            <li>The End User has provided their phone number (for SMS) or email address (for email).</li>
          </ul>
          <p>
            SMS messages are sent via Twilio and emails via Resend. Standard messaging rates may apply.
            End Users may opt out of future communications by contacting the Service User or by emailing{' '}
            <a href="mailto:support@pixflow-ai.com">support@pixflow-ai.com</a>.
          </p>

          <h2>8. Payment Terms</h2>
          <p>
            Certain features of the Service require a paid subscription. Prices are listed on our website and are
            subject to change with 30 days' notice. All fees are charged in US dollars and are non-refundable
            except as required by law or as described in Section 7.
          </p>
          <p>
            Subscriptions automatically renew at the end of each billing cycle unless cancelled before the renewal
            date. You authorize us to charge your payment method on file for recurring subscription fees.
          </p>

          <h2>9. Cancellation and Refunds</h2>
          <p>
            You may cancel your subscription at any time from your account settings. Upon cancellation, you will
            retain access to paid features until the end of your current billing period. After that, your account
            will revert to the Starter (free) plan.
          </p>
          <p>
            We do not provide prorated refunds for partial billing periods. If you believe you have been charged
            in error, please contact us at support@pixflow-ai.com within 30 days of the charge.
          </p>

          <h2>10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Pixflow and its officers, employees, and affiliates shall not
            be liable for any indirect, incidental, special, consequential, or punitive damages, including but not
            limited to loss of profits, data, or business opportunities, arising from your use of or inability to
            use the Service.
          </p>
          <p>
            Our total aggregate liability to you for all claims arising from or related to the Service shall not
            exceed the amount you paid to us in the twelve (12) months preceding the claim.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. When we make material changes, we will notify you by
            email or through the Service at least 30 days before the changes take effect. Your continued use of
            the Service after the effective date of updated Terms constitutes your acceptance of those changes.
          </p>

          <h2>12. Contact</h2>
          <p>
            If you have questions about these Terms, please contact us at{' '}
            <a href="mailto:support@pixflow-ai.com">support@pixflow-ai.com</a>.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  )
}
