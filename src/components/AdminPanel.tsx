import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { Loader2, Pause, Play, Plus, ShieldCheck, UserMinus, UserPlus } from 'lucide-react'
import { ledgerAbi } from '@/contracts/abis'
import type { LedgerState } from '@/hooks/useLedger'
import { useSend } from '@/hooks/useSend'
import { usd } from '@/lib/ledger'

interface Props {
  ledger: Address
  data: LedgerState
}

export function AdminPanel({ ledger, data }: Props) {
  const { send, busy } = useSend()
  const [catName, setCatName] = useState('')
  const [catKind, setCatKind] = useState<'0' | '1'>('1')
  const [member, setMember] = useState('')

  const addCategory = async () => {
    const ok = await send({ address: ledger, abi: ledgerAbi, functionName: 'addCategory', args: [catName.trim(), Number(catKind)] })
    if (ok) setCatName('')
  }

  const grant = async (revoke: boolean) => {
    const ok = await send({
      address: ledger,
      abi: ledgerAbi,
      functionName: revoke ? 'revokeRole' : 'grantRole',
      args: [data.bookkeeperRole, member],
    })
    if (ok) setMember('')
  }

  const maxTotal = data.categories.reduce((m, c) => (c.total > m ? c.total : m), 0n)

  return (
    <div className="space-y-4">
      <section className="glass-card rounded-3xl p-5">
        <p className="label-caps">Categories</p>
        <ul className="mt-3 space-y-3">
          {data.categories.map((c) => {
            const pct = maxTotal > 0n ? Number((c.total * 100n) / maxTotal) : 0
            return (
              <li key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {c.name} <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{c.kind === 0 ? 'income' : 'expense'}{c.active ? '' : ' · off'}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{usd(c.total)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.kind === 0 ? 'var(--success)' : 'var(--accent)' }} />
                </div>
                {data.isAdmin && (
                  <button
                    disabled={busy}
                    onClick={() => void send({ address: ledger, abi: ledgerAbi, functionName: 'setCategoryStatus', args: [BigInt(c.id), !c.active] })}
                    className="mt-1 min-h-[28px] text-[11px] font-semibold disabled:opacity-40"
                    style={{ color: 'var(--muted)' }}
                  >
                    {c.active ? 'Turn off' : 'Turn on'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {data.isAdmin && (
          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-2">
              <input className="field" placeholder="New category" maxLength={64} value={catName} onChange={(e) => setCatName(e.target.value)} />
              <select className="field !w-auto" aria-label="Category type" value={catKind} onChange={(e) => setCatKind(e.target.value as '0' | '1')}>
                <option value="1">Expense</option>
                <option value="0">Income</option>
              </select>
              <button className="btn-ghost !px-3" aria-label="Add category" disabled={busy || !catName.trim()} onClick={() => void addCategory()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </button>
            </div>
          </div>
        )}
      </section>

      {data.isAdmin && (
        <section className="glass-card rounded-3xl p-5">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" style={{ color: 'var(--muted)' }} />
            <p className="label-caps">Team</p>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Bookkeepers can pay expenses and void entries. Anyone can add income.
          </p>
          <input className="field mono mt-3" placeholder="0x… wallet address" value={member} onChange={(e) => setMember(e.target.value.trim())} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn-ghost flex items-center justify-center gap-1.5" disabled={busy || !isAddress(member)} onClick={() => void grant(false)}>
              <UserPlus className="size-4" /> Add
            </button>
            <button className="btn-ghost flex items-center justify-center gap-1.5" disabled={busy || !isAddress(member)} onClick={() => void grant(true)}>
              <UserMinus className="size-4" /> Remove
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="text-sm font-semibold">{data.paused ? 'Payments are paused' : 'Payments are live'}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Pausing blocks new income and payouts.</p>
            </div>
            <button
              className="btn-ghost flex items-center gap-1.5"
              disabled={busy}
              onClick={() => void send({ address: ledger, abi: ledgerAbi, functionName: data.paused ? 'unpause' : 'pause' })}
            >
              {data.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {data.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
