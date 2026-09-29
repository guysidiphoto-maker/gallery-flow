import { container } from './classes'
import { DOWNLOAD_URL, type LandingCopy } from './copy'

interface Props {
  tx: LandingCopy
  onNavigate: (id: string) => void
}

const heading = 'mb-4 text-[0.8rem] font-bold tracking-[0.05em] text-white/50 uppercase'
const link = 'block cursor-pointer py-1 text-right text-[0.85rem] text-white/60 no-underline transition-colors duration-200 ease-[ease] hover:text-white hover:underline hover:underline-offset-3'

export function LandingFooter({ tx, onNavigate }: Props) {
  return (
    <footer className="relative border-t border-white/6 pt-[60px] pb-8 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-(image:--mk-lp-footer-line)">
      <div className={`${container} grid grid-cols-[repeat(3,1fr)] gap-10 max-md:grid-cols-[1fr] max-md:gap-8`}>
        <div>
          <h4 className={heading}>{tx.footerProduct}</h4>
          <button className={link} onClick={() => onNavigate('features')}>{tx.navFeatures}</button>
          <button className={link} onClick={() => onNavigate('pricing')}>{tx.navPricing}</button>
          <a className={link} href={DOWNLOAD_URL}>{tx.navDownload}</a>
          <a className={link} href="/demo">{tx.footerChangelog}</a>
        </div>
        <div>
          <h4 className={heading}>{tx.footerCompany}</h4>
          <a className={link} href="#">{tx.footerAbout}</a>
          <a className={link} href="#">{tx.footerBlog}</a>
          <a className={link} href="#">{tx.footerContact}</a>
        </div>
        <div>
          <h4 className={heading}>{tx.footerLegal}</h4>
          <a className={link} href="/terms">{tx.footerTerms}</a>
          <a className={link} href="/privacy">{tx.footerPrivacy}</a>
        </div>
      </div>
      <div className="mt-12 px-6 text-center text-[0.75rem] text-white/30">
        &copy; {new Date().getFullYear()} Pixflow. All rights reserved.
      </div>
    </footer>
  )
}
