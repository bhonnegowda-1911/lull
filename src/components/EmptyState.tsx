import type { ReactNode } from 'react'

// Shared blank-canvas state for tabs whose whole list is empty. A dashed cream panel
// (reads as "nothing here yet / drop zone"), a terracotta-ringed glyph, a serif title,
// and an optional CTA so the empty state can *do* something instead of just explaining.
// Secondary "add one on the other tab" redirects stay inline — this is for the main view.

type Props = {
  icon: ReactNode
  title: string
  description: ReactNode
  action?: { label: string; onClick: () => void }
  className?: string
}

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-[#fcfaf6] px-6 py-12 text-center ${className ?? ''}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-600">
        {icon}
      </div>
      <h3 className="mt-4 font-serif text-base font-semibold text-stone-800">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
