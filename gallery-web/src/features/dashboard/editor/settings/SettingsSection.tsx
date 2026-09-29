import type React from 'react'
import { Panel } from '@/shared/ui'

export function SettingsSection({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return <Panel eyebrow={<span className="font-medium">{eyebrow}</span>}>{children}</Panel>
}
