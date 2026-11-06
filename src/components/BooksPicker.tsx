import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { ConnectKitButton } from 'connectkit'
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import { factoryAbi } from '@/contracts/abis'
import { useSend } from '@/hooks/useSend'
import { CHAIN_ID, FACTORY_ADDRESS, dateTime, shortAddr } from '@/lib/ledger'

interface LedgerInfo {
  ledger: Address
  owner: Address
  name: string
  createdAt: bigint
}

const RECENTS_KEY = 'ledgerline:recent'

export function loadRecents(): Address[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((a): a is Address => typeof a === 'string' && isAddress(a)) : []
  } catch {
    return []
  }
}

export function rememberLedger(address: Address) {
  const next = [address, ...loadRecents().filter((a) => a.toLowerCase() !== address.toLowerCase())].slice(0, 8)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
}

export function BooksPicker({ onOpen }: { onOpen: (address: Address) => void }) {
  const { address, isConnected } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { send, status, busy } = useSend()
  const [name, setName] = useState('')
  const [manual, setManual] = useState('')

  const mine = useQuery({
    queryKey: ['my-ledgers', address],
    enabled: Boolean(address && client && FACTORY_ADDRESS),
    queryFn: async (): Promise<LedgerInfo[]> => {
      if (!client || !FACTORY_ADDRESS || !address) return []
      const ids = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: 'ledgerIdsOf',
        args: [address],
      }))
      const infos = await Promise.all(
        ids.map((id) =>
          client.readContract({ address: FACTORY_ADDRESS!, abi: factoryAbi, functionName: 'getLedger', args: [id] }),
        ),
      )
      return (infos as LedgerInfo[]).slice().reverse()
    },
  })

  const create = async () => {
    if (!FACTORY_ADDRESS || !client || !address) return
    const before = mine.data?.length ?? 0
    const hash = await send({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'createLedger', args: [name.trim()] })
    if (!hash) return
    setName('')
    const result = await mine.refetch()
    const list = result.data ?? []
    if (list.length > before && list[0]) onOpen(list[0].ledger)
  }

  const recents = loadRecents()
  const nameOk = name.trim().length > 0 && new TextEncoder().encode(name.trim()).length <= 64

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-24 md:grid-cols-5">
      <section className="glass-card rounded-3xl p-6 md:col-span-3">
        <p className="label-caps">Start here</p>
        <h1 className="display mt-2 text-balance text-4xl font-bold">Books that nobody can quietly rewrite.</h1>
        <p className="mt-3 max-w-[52ch] text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          Every USDC you receive or pay out is recorded in a public, append-only ledger with a category, a memo and an
          invoice reference. Mistakes are voided with a reason, never deleted.
        </p>

        <div className="glass-inner mt-6 rounded-2xl p-4">
          <label htmlFor="books-name" className="label-caps">New set of books</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="books-name"
              className="field"
              placeholder="e.g. Acme Studio 2026"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
            />
            {isConnected ? (
              <button className="btn-primary shrink-0" disabled={!nameOk || busy || !FACTORY_ADDRESS} onClick={() => void create()}>
                {status === 'wallet' ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet</span>
                ) : status === 'confirming' ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Creating</span>
                ) : (
                  <span className="flex items-center justify-center gap-2"><Plus className="size-4" /> Create books</span>
                )}
              </button>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <button className="btn-primary shrink-0" onClick={show}>Connect wallet</button>
                )}
              </ConnectKitButton.Custom>
            )}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            You become the admin. Network fees on Arc are paid in USDC.
          </p>
          {!FACTORY_ADDRESS && (
            <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>The ledger factory address is not configured.</p>
          )}
        </div>
      </section>

      <section className="glass-card rounded-3xl p-6 md:col-span-2">
        <p className="label-caps">Your books</p>
        <div className="mt-3 space-y-2">
          {!isConnected && <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect a wallet to see books you created.</p>}
          {isConnected && mine.isLoading && <div className="h-14 animate-pulse rounded-2xl" style={{ background: 'var(--surface-muted)' }} />}
          {isConnected && !mine.isLoading && (mine.data?.length ?? 0) === 0 && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No books yet. Create your first set on the left.</p>
          )}
          {mine.data?.map((l) => (
            <button
              key={l.ledger}
              onClick={() => onOpen(l.ledger)}
              className="glass-inner flex min-h-[56px] w-full items-center justify-between rounded-2xl px-4 py-2 text-left transition-colors hover:bg-white"
            >
              <span>
                <span className="block text-sm font-semibold">{l.name}</span>
                <span className="mono block text-[11px]" style={{ color: 'var(--subtle)' }}>
                  {shortAddr(l.ledger)} · {dateTime(l.createdAt)}
                </span>
              </span>
              <ArrowRight className="size-4" style={{ color: 'var(--subtle)' }} />
            </button>
          ))}
        </div>

        <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <label htmlFor="open-addr" className="label-caps">Open books by address</label>
          <div className="mt-2 flex gap-2">
            <input
              id="open-addr"
              className="field mono"
              placeholder="0x…"
              value={manual}
              onChange={(e) => setManual(e.target.value.trim())}
            />
            <button className="btn-ghost shrink-0" disabled={!isAddress(manual)} onClick={() => isAddress(manual) && onOpen(manual)}>
              Open
            </button>
          </div>
          {recents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recents.map((r) => (
                <button key={r} onClick={() => onOpen(r)} className="mono rounded-full px-3 py-1.5 text-[11px]" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                  {shortAddr(r)}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
