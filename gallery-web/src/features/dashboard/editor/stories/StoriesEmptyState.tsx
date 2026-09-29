import { Icon } from '@/shared/ui/Icon'

export function StoriesEmptyState() {
  return (
    <div className="border border-dashed border-line bg-surface px-5 py-[52px] text-center text-muted">
      <div className="mb-3.5 flex justify-center text-muted opacity-55">
        <Icon name="stories" size={36} strokeWidth={1.4} />
      </div>
      <div className="text-[14px]">
        עדיין אין סטוריז. הוסף את הראשון בלחיצה על "העלאת סטורי".
      </div>
    </div>
  )
}
