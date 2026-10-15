import { cn } from '@/lib/utils'

import { DialogBox } from './DialogBox'
import { Button } from './ui/button'

export type StatusKind = 'empty' | 'end' | 'error' | 'loading'

const COPY: Record<StatusKind, string> = {
  empty: 'But nothing appeared! Try another type.',
  end: "That's every creature on file!",
  error: 'The connection fled! Try again.',
  loading: 'More creatures appeared…'
}

type StatusBoxProps = { kind: StatusKind; onAction?: () => void }

export function StatusBox({ kind, onAction }: StatusBoxProps) {
  return (
    <DialogBox
      className="mx-auto w-full max-w-xl text-center"
      role={kind === 'error' ? 'alert' : undefined}
      showMore={kind === 'empty' || kind === 'loading'}
    >
      {/* Error copy is bold: #E04038 on white needs large text (bold ≥18.66px) to pass. */}
      <p
        className={cn(
          'text-body-lg',
          kind === 'error' && 'font-bold text-danger'
        )}
      >
        {COPY[kind]}
      </p>
      {kind === 'empty' && onAction && (
        <Button className="mt-4" onClick={onAction}>
          Clear filters
        </Button>
      )}
      {kind === 'error' && onAction && (
        <Button className="mt-4" onClick={onAction} variant="secondary">
          Try again
        </Button>
      )}
    </DialogBox>
  )
}
