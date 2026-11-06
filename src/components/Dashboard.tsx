import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { ArrowLeft, Copy, ExternalLink, HandCoins, Send } from 'lucide-react'
import { toast } from 'sonner'
import { buildShareLink } from '@/lib/share'
import { useLedger } from '@/hooks/useLedger'
import { addressUrl, shortAddr } from '@/lib/ledger'
import { AdminPanel } from './AdminPanel'
import { EntriesTable } from './EntriesTable'
import { Overview } from './Overview'
import { RecordSheet, type SheetMode } from './RecordSheet'
import { rememberLedger } from './BooksPicker'

export function Dashboard({ ledger, onBack }: { ledger: Address; onBack: () => void }) {
  const { address } = useAccount()
  const { data, isLoading, isError, refetch } = useLedger(ledger, address)
  const [mode, setMode] = useState<SheetMode | null>(null)
  const [shareUrl, setShareUrl] = useState<string>()

  useEffect(() => {
    rememberLedger(ledger)
    let cancelled = false
    void buildShareLink(`/?ledger=${ledger}`).then((url) => {
      if (!cancelled) setShareUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [ledger])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> All books
        </button>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
          <span className="mono">{shortAddr(ledger)}</span>
          <button
            aria-label="Copy share link"
            disabled={!shareUrl}
            className="flex size-9 items-center justify-center rounded-full disabled:opacity-40"
            onClick={() => shareUrl && void navigator.clipboard.writeText(shareUrl).then(() => toast.success('Link copied'))}
          >
            <Copy className="size-3.5" />
          </button>
          <a aria-label="View on explorer" href={addressUrl(ledger)} target="_blank" rel="noreferrer" className="flex size-9 items-center justify-center rounded-full">
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-3xl" style={{ background: 'var(--surface-muted)' }} />
          <div className="h-64 animate-pulse rounded-3xl" style={{ background: 'var(--surface-muted)' }} />
        </div>
      )}

      {isError && (
        <div className="glass-card rounded-3xl p-6 text-center">
          <p className="text-sm font-semibold">Could not read these books.</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Check the address is a ledger on Arc Testnet.</p>
          <button className="btn-ghost mt-4" onClick={() => void refetch()}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <Overview data={data} />

          <div className="grid grid-cols-2 gap-3">
            <button className="btn-primary flex items-center justify-center gap-2" disabled={data.paused} onClick={() => setMode({ kind: 'deposit' })}>
              <HandCoins className="size-4" /> Record income
            </button>
            <button
              className="btn-ghost flex items-center justify-center gap-2"
              disabled={!data.isBookkeeper || data.paused}
              title={data.isBookkeeper ? undefined : 'Only bookkeepers can pay expenses'}
              onClick={() => setMode({ kind: 'pay' })}
            >
              <Send className="size-4" /> Pay expense
            </button>
          </div>
          {data.paused && <p className="text-center text-xs" style={{ color: 'var(--danger)' }}>The admin has paused new income and payouts.</p>}

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <EntriesTable data={data} ledger={ledger} canVoid={data.isBookkeeper} onVoid={(entry) => setMode({ kind: 'void', entry })} />
            </div>
            <div className="lg:col-span-2">
              <AdminPanel ledger={ledger} data={data} />
            </div>
          </div>

          <p className="text-center text-[11px]" style={{ color: 'var(--subtle)' }}>
            Everything in these books, including memos, is public onchain. Never put private details in a memo.
          </p>
          <RecordSheet mode={mode} ledger={ledger} data={data} onClose={() => setMode(null)} />
        </>
      )}
    </div>
  )
}
