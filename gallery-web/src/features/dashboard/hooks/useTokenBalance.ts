import { useState } from 'react'
import { getMyTokenBalance } from '../lib/tokenClient'

export function useTokenBalance() {
  const [tokenBalance, setTokenBalance] = useState<number>(0)
  // False until the first read lands, so the sidebar shows a placeholder, not a "low" 0.
  const [tokenBalanceLoaded, setTokenBalanceLoaded] = useState(false)
  const [showBuyTokens, setShowBuyTokens] = useState(false)

  async function fetchTokenBalance() {
    const balance = await getMyTokenBalance()
    setTokenBalance(balance)
    setTokenBalanceLoaded(true)
  }

  return { tokenBalance, tokenBalanceLoaded, fetchTokenBalance, showBuyTokens, setShowBuyTokens }
}
