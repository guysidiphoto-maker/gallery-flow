import { windowBar, windowFrame } from './classes'
import { MockGrid } from './MockGrid'
import { WindowDots } from './WindowDots'

/** Mac app window with a grid of placeholder photos. */
export function AppMockup({ stars }: { stars?: number[] }) {
  return (
    <div className={windowFrame}>
      <div className={windowBar}><WindowDots /></div>
      <MockGrid stars={stars} />
    </div>
  )
}
