import { useState } from 'react'
import { getMyTokenBalance } from '../lib/tokenClient'

export function useTokenBalance() {
  const [tokenBalance, setTokenBalance] = useState<number>(0)
  const [showBuyTokens, setShowBuyTokens] = useState(false)

  async function fetchTokenBalance() {
    const balance = await getMyTokenBalance()
    setTokenBalance(balance)
  }

  return { tokenBalance, fetchTokenBalance, showBuyTokens, setShowBuyTokens }
}
