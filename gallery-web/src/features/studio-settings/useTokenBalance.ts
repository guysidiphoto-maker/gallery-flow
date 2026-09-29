import { useEffect, useState } from 'react'
import { getMyTokenBalance } from '@/features/dashboard/lib/tokenClient'

/** Token balance, fetched once `enabled` turns true (after the business lookup settles). */
export function useTokenBalance(enabled: boolean) {
  const [balance, setBalance] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void getMyTokenBalance().then(b => { if (!cancelled) setBalance(b) })
    return () => { cancelled = true }
  }, [enabled])
  return balance
}
