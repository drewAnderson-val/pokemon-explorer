// Always full: the app has no damage, the bar is flavour for the HP stat.
export function HpBar({ hp }: { hp: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-tag bg-ink px-1.5 text-label font-bold text-accent">
        HP
      </span>
      <span
        aria-hidden
        className="h-2.5 flex-1 overflow-hidden rounded-inset frame-inset bg-track"
      >
        <span className="block size-full bg-hp-good" />
      </span>
      <span className="text-caption">
        {hp}/{hp}
      </span>
    </div>
  )
}
