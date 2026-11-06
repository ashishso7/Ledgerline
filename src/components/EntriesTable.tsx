import { useMemo, useState } from 'react'
import { Ban, Download, ExternalLink, Search } from 'lucide-react'
import type { Address } from 'viem'
import type { LedgerState } from '@/hooks/useLedger'
import { addressUrl, dateTime, entriesToCsv, shortAddr, usd, type Entry } from '@/lib/ledger'

type Filter = 'all' | 'income' | 'expense'

interface Props {
  data: LedgerState
  canVoid: boolean
  onVoid: (entry: Entry) => void
  ledger: Address
}

export function EntriesTable({ data, canVoid, onVoid, ledger }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const categoryName = (id: bigint) => data.categories.find((c) => BigInt(c.id) === id)?.name ?? `#${id}`

  const rows = useMemo(() => {
    const nameOf = (id: bigint) => data.categories.find((c) => BigInt(c.id) === id)?.name ?? `#${id}`
    const q = query.trim().toLowerCase()
    return data.entries
      .slice()
      .reverse()
      .filter((e) => (filter === 'all' ? true : filter === 'income' ? e.kind === 0 : e.kind === 1))
      .filter(
        (e) =>
          !q ||
          e.memo.toLowerCase().includes(q) ||
          e.counterparty.toLowerCase().includes(q) ||
          nameOf(e.categoryId).toLowerCase().includes(q),
      )
  }, [data.entries, data.categories, filter, query])

  const exportCsv = () => {
    const blob = new Blob([entriesToCsv(data.entries, data.categories)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${ledger.slice(2, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-caps">General ledger</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {data.entryCount.toString()} entries{data.entries.length < Number(data.entryCount) ? `, latest ${data.entries.length} shown` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full p-1" style={{ background: 'var(--surface-muted)' }}>
            {(['all', 'income', 'expense'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="min-h-[36px] rounded-full px-3 text-xs font-semibold capitalize transition-colors"
                style={{ background: filter === f ? '#fff' : 'transparent', color: filter === f ? 'var(--ink)' : 'var(--muted)' }}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="btn-ghost !min-h-[44px] !px-3" onClick={exportCsv} disabled={data.entries.length === 0} aria-label="Export CSV">
            <Download className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--subtle)' }} />
        <input className="field !pl-10" placeholder="Search memo, category or address" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          {data.entries.length === 0 ? 'No entries yet. Record the first payment or deposit.' : 'No entries match your filters.'}
        </div>
      ) : (
        <ul className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map((e) => {
            const income = e.kind === 0
            return (
              <li key={e.id.toString()} className="flex items-center gap-3 py-3" style={{ borderColor: 'var(--border)', opacity: e.voided ? 0.55 : 1 }}>
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: income ? 'rgba(26,128,71,0.12)' : 'rgba(186,43,76,0.1)', color: income ? 'var(--success)' : 'var(--danger)' }}
                >
                  {income ? 'IN' : 'OUT'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold" style={{ textDecoration: e.voided ? 'line-through' : 'none' }}>
                      {e.memo || categoryName(e.categoryId)}
                    </span>
                    {e.voided && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>Voided</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
                    <span>{categoryName(e.categoryId)}</span>
                    <span>·</span>
                    <a href={addressUrl(e.counterparty)} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-0.5 hover:underline">
                      {shortAddr(e.counterparty)} <ExternalLink className="size-2.5" />
                    </a>
                    <span>·</span>
                    <span>{dateTime(e.timestamp)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="display text-sm font-bold tabular-nums" style={{ color: income ? 'var(--success)' : 'var(--ink)' }}>
                    {income ? '+' : '-'}{usd(e.amount)}
                  </div>
                  {canVoid && !e.voided && (
                    <button onClick={() => onVoid(e)} className="mt-0.5 inline-flex min-h-[28px] items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                      <Ban className="size-3" /> Void
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
