import { ConnectKitButton } from 'connectkit'
import { BookOpenText } from 'lucide-react'

export function Header() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
          <BookOpenText className="size-4 text-white" />
        </div>
        <div>
          <div className="display text-lg font-bold leading-none">Ledgerline</div>
          <div className="mt-1 text-[11px] leading-none" style={{ color: 'var(--subtle)' }}>
            Onchain bookkeeping on Arc Testnet
          </div>
        </div>
      </div>
      <ConnectKitButton />
    </header>
  )
}
