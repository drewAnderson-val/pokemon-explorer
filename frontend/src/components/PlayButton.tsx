export function PlayButton({ href }: { href: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Bob on the link, scale on the inner circle, so the transforms don't fight. */}
      <a
        aria-label="Start exploring"
        className="group animate-bob rounded-full focus-visible:focus-ring-sky"
        href={href}
      >
        <span className="flex size-[132px] items-center justify-center rounded-full border-[6px] border-ink bg-accent shadow-press transition-transform duration-120 ease-[steps(2)] group-hover:scale-106 group-active:scale-96">
          <svg
            aria-hidden
            className="ml-2 size-[52px] fill-ink"
            viewBox="0 0 13 13"
          >
            {/* Stepped "pixel" play triangle. */}
            <path d="M2 0h2v1h2v1h2v1h2v1h2v1h1v3h-1v1h-2v1h-2v1h-2v1H4v1H2z" />
          </svg>
        </span>
      </a>
      <span
        aria-hidden
        className="animate-blink text-label font-bold text-white uppercase sky-shadow"
      >
        Press start
      </span>
    </div>
  )
}
