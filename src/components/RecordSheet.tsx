import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { erc20Abi, isAddress, keccak256, toBytes, type Address } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ledgerAbi } from '@/contracts/abis'
import type { LedgerState } from '@/hooks/useLedger'
import { useSend } from '@/hooks/useSend'
import { getUsdc } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { CHAIN_ID, USDC_DECIMALS, ZERO_BYTES32, txUrl, usd, type Entry } from '@/lib/ledger'
import { Amount } from '@/onchain-money'

export type SheetMode = { kind: 'deposit' } | { kind: 'pay' } | { kind: 'void'; entry: Entry }

interface Props {
  mode: SheetMode | null
  ledger: Address
  data: LedgerState
  onClose: () => void
}

const USDC = getUsdc(CHAIN_ID)?.address as Address

export function RecordSheet({ mode, ledger, data, onClose }: Props) {
  return (
    <AnimatePresence>
      {mode && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#85b1ed,#c9b6f2,#f2c9a8,#a8e0c0)' }} />
            <div className="px-5 pb-6 pt-4">
              <SheetBody mode={mode} ledger={ledger} data={data} onClose={onClose} />
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SheetBody({ mode, ledger, data, onClose }: { mode: SheetMode; ledger: Address; data: LedgerState; onClose: () => void }) {
  const { address } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { send, status, busy } = useSend()
  const isDeposit = mode.kind === 'deposit'
  const isVoid = mode.kind === 'void'

  const cats = data.categories.filter((c) => c.active && c.kind === (isDeposit ? 0 : 1))
  const [categoryId, setCategoryId] = useState<string>(cats[0] ? String(cats[0].id) : '')
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')
  const [memo, setMemo] = useState('')
  const [invoice, setInvoice] = useState('')
  const [reason, setReason] = useState('')
  const [step, setStep] = useState<'approve' | 'record' | null>(null)
  const [doneHash, setDoneHash] = useState<`0x${string}` | undefined>()

  const wallet = useQuery({
    queryKey: ['usdc-wallet', address, ledger],
    enabled: Boolean(address && client && isDeposit),
    queryFn: async () => {
      if (!client || !address) return { balance: 0n, allowance: 0n }
      const [balance, allowance] = await Promise.all([
        client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        client.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [address, ledger] }),
      ])
      return { balance, allowance }
    },
  })

  let raw: bigint | undefined
  try {
    raw = amount ? parseAmount(CHAIN_ID, amount).raw : undefined
  } catch {
    raw = undefined
  }

  const title = isDeposit ? 'Record income' : isVoid ? 'Void entry' : 'Pay an expense'
  const canSubmit = (() => {
    if (!address || busy) return false
    if (isVoid) return reason.trim().length > 0
    if (!raw || raw <= 0n || categoryId === '') return false
    if (isDeposit) return !wallet.isLoading && (wallet.data?.balance ?? 0n) >= raw
    return isAddress(to) && data.treasury >= raw
  })()

  const refHash = () => (invoice.trim() ? keccak256(toBytes(invoice.trim())) : ZERO_BYTES32)

  const submit = async () => {
    if (mode.kind === 'void') {
      const hash = await send({ address: ledger, abi: ledgerAbi, functionName: 'voidEntry', args: [mode.entry.id, reason.trim()] })
      if (hash) {
        toast.success('Entry voided')
        onClose()
      }
      return
    }
    if (!raw) return
    if (mode.kind === 'deposit') {
      if ((wallet.data?.allowance ?? 0n) < raw) {
        setStep('approve')
        const ok = await send({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [ledger, raw] })
        if (!ok) {
          setStep(null)
          return
        }
      }
      setStep('record')
      const hash = await send({ address: ledger, abi: ledgerAbi, functionName: 'deposit', args: [BigInt(categoryId), raw, memo.trim(), refHash()] })
      setStep(null)
      if (hash) setDoneHash(hash)
      return
    }
    setStep('record')
    const hash = await send({ address: ledger, abi: ledgerAbi, functionName: 'payExpense', args: [BigInt(categoryId), to, raw, memo.trim(), refHash()] })
    setStep(null)
    if (hash) setDoneHash(hash)
  }

  const cta = () => {
    if (busy) {
      const label = status === 'wallet' ? 'Confirm in wallet' : 'Confirming'
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> {step === 'approve' ? `Step 1 of 2: ${label}` : label}
        </span>
      )
    }
    if (isVoid) return 'Void entry'
    if (isDeposit) return raw && (wallet.data?.allowance ?? 0n) < raw ? 'Allow USDC and record' : 'Record income'
    return 'Send payment'
  }

  if (doneHash) {
    return (
      <div className="py-6 text-center">
        <div className="display text-2xl font-bold" style={{ color: 'var(--success)' }}>Recorded</div>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>The entry is now part of the permanent ledger.</p>
        <a href={txUrl(doneHash)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold underline" style={{ color: 'var(--accent-hover)' }}>
          View on explorer
        </a>
        <button className="btn-primary mt-5 w-full" onClick={onClose}>Done</button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="display text-xl font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
          <X className="size-4" />
        </button>
      </div>

      {isVoid ? (
        <div className="space-y-3">
          <div className="glass-inner rounded-2xl p-3 text-sm">
            Entry #{mode.entry.id.toString()} · {mode.entry.memo || 'No memo'} · <span className="font-semibold tabular-nums">{usd(mode.entry.amount)} USDC</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Voiding removes this entry from the totals and keeps a permanent note. It does not move any USDC back.
          </p>
          <label className="block">
            <span className="label-caps">Reason</span>
            <input className="field mt-1.5" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate of entry 12" />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="glass-inner rounded-2xl p-4">
            <input
              inputMode="decimal"
              aria-label="Amount in USDC"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (/^\d*\.?\d*$/.test(v) && (v.split('.')[1]?.length ?? 0) <= USDC_DECIMALS) setAmount(v)
              }}
              placeholder="0.00"
              className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            />
            <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
              <span>USDC</span>
              {isDeposit ? (
                <button
                  disabled={!wallet.data}
                  onClick={() => wallet.data && setAmount(Amount.fromRaw(wallet.data.balance, USDC_DECIMALS).toFixed(USDC_DECIMALS))}
                  className="font-semibold disabled:opacity-40"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  {wallet.data ? `Balance ${usd(wallet.data.balance)} · Max` : 'Loading balance'}
                </button>
              ) : (
                <span>Treasury {usd(data.treasury)}</span>
              )}
            </div>
          </div>

          {raw !== undefined && isDeposit && wallet.data && wallet.data.balance < raw && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>Your wallet holds less USDC than this amount.</p>
          )}
          {raw !== undefined && !isDeposit && data.treasury < raw && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>The treasury does not hold enough USDC.</p>
          )}

          <label className="block">
            <span className="label-caps">Category</span>
            <select className="field mt-1.5" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.length === 0 && <option value="">No active categories</option>}
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          {!isDeposit && (
            <label className="block">
              <span className="label-caps">Pay to</span>
              <input className="field mono mt-1.5" placeholder="0x… recipient address" value={to} onChange={(e) => setTo(e.target.value.trim())} />
              {to && !isAddress(to) && <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>Enter a valid address.</span>}
            </label>
          )}

          <label className="block">
            <span className="label-caps">Memo</span>
            <input className="field mt-1.5" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this for?" />
          </label>
          <label className="block">
            <span className="label-caps">Invoice or reference (optional)</span>
            <input className="field mt-1.5" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="e.g. INV-2026-014" />
          </label>
        </div>
      )}

      <button className="btn-primary mt-5 w-full" disabled={!canSubmit} onClick={() => void submit()}>{cta()}</button>
    </div>
  )
}
