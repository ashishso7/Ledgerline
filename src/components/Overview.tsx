import { ArrowDownLeft, ArrowUpRight, Vault } from 'lucide-react'
import type { LedgerState } from '@/hooks/useLedger'
import { usd } from '@/lib/ledger'

export function Overview({ data }: { data: LedgerState }) {
  const net = data.totalIncome - data.totalExpense
  const netNegative = net < 0n
  const abs = netNegative ? -net : net

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <section className="glass-card rounded-3xl p-6 md:col-span-3">
        <div className="mb-3 flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-md" style={{ background: 'rgba(18,45,69,0.08)' }}>
            <Vault className="size-3" style={{ color: 'var(--ink)' }} />
          </div>
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Treasury balance</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="display text-5xl font-bold tabular-nums">{usd(data.treasury)}</span>
          <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          Live USDC held by this ledger. Net booked result{' '}
          <span className="font-semibold tabular-nums" style={{ color: netNegative ? 'var(--danger)' : 'var(--success)' }}>
            {netNegative ? '-' : '+'}{usd(abs)}
          </span>{' '}
          after voids.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-1">
        <Stat label="Income" value={data.totalIncome} icon={<ArrowDownLeft className="size-3.5" />} tone="var(--success)" />
        <Stat label="Expenses" value={data.totalExpense} icon={<ArrowUpRight className="size-3.5" />} tone="var(--danger)" />
      </div>
    </div>
  )
}

function Stat({ label, value, icon, tone }: { label: string; value: bigint; icon: React.ReactNode; tone: string }) {
  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: tone }}>
        {icon}
        <span style={{ color: 'var(--muted)' }}>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="display text-2xl font-bold tabular-nums">{usd(value)}</span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
      </div>
    </div>
  )
}
