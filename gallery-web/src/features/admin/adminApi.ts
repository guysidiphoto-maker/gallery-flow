export type UserRow = {
  business_id: string
  email: string | null
  business_name: string
  slug: string | null
  created_at: string | null
  plan_id: string | null
  plan_name: string | null
  subscription_status: string | null
  balance: number
  gallery_count: number
}

export type GrantRow = {
  ledger_id: string
  business_id: string
  business_name: string | null
  amount: number
  admin_email: string | null
  reason: string | null
  request_id: string | null
  created_at: string
}

export const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—')
