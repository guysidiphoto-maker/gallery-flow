import { signInWithGoogle } from '@/shared/lib/auth'
import { Button } from '../components/ui'

export function HeroCTAs() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button size="lg" onClick={() => signInWithGoogle()} className="px-[34px] py-[15px] text-[16px]">
        התחילו עכשיו
      </Button>
      <Button variant="secondary" size="lg" onClick={() => { window.location.href = '/demo' }}>
        צפו בדמו
      </Button>
    </div>
  )
}
