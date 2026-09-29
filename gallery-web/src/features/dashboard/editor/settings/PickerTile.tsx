import type React from 'react'
import { OptionTile } from '@/shared/ui/OptionTile'

export function PickerTile({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <OptionTile selected={active} onClick={onClick} className="flex-1 px-4 py-3.5 text-right">
      {children}
    </OptionTile>
  )
}
