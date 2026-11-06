import type { Address } from 'viem'
import { isAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

export const CHAIN_ID = arcTestnet.id
export const USDC_DECIMALS = usdcDecimalsFor(CHAIN_ID)

const rawFactory = import.meta.env.VITE_LEDGER_FACTORY_ADDRESS as string | undefined
export const FACTORY_ADDRESS: Address | undefined =
  rawFactory && isAddress(rawFactory) ? rawFactory : undefined

export const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const

export type Kind = 0 | 1 // 0 = income, 1 = expense

export interface Entry {
  id: bigint
  timestamp: bigint
  categoryId: bigint
  kind: number
  counterparty: Address
  amount: bigint
  memo: string
  ref: `0x${string}`
  recordedBy: Address
  voided: boolean
}

export interface Category {
  id: number
  name: string
  kind: number
  active: boolean
  total: bigint
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export const usd = (raw: bigint) =>
  Amount.fromRaw(raw, USDC_DECIMALS).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const dateTime = (ts: bigint) =>
  new Date(Number(ts) * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export const addressUrl = (a: string) => buildAddressExplorerUrl(CHAIN_ID, a)
export const txUrl = (h: string) => buildTxExplorerUrl(CHAIN_ID, h)

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; shortMessage?: string; code?: number } | undefined
  const msg = (e?.shortMessage ?? e?.message ?? '').toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied') || e?.code === 4001) return 'Cancelled in wallet.'
  if (msg.includes('insufficient funds')) return 'Not enough USDC to cover gas.'
  if (msg.includes('insufficienttreasurybalance')) return 'The treasury does not hold enough USDC for this payment.'
  if (msg.includes('accesscontrol') || msg.includes('unauthorized')) return 'Your wallet does not have permission for this action.'
  if (msg.includes('enforcedpause')) return 'The books are paused.'
  if (msg.includes('transfer amount exceeds') || msg.includes('erc20insufficient')) return 'Your USDC balance is too low.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network issue. Check your connection and retry.'
  if (msg.includes('reverted')) return 'The transaction was rejected by the contract.'
  return 'Something went wrong. Please try again.'
}

/** Hash an invoice or reference string into the bytes32 ref stored with an entry. */
export { keccak256, toBytes } from 'viem'

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

export function entriesToCsv(entries: Entry[], categories: Category[]): string {
  const name = (id: bigint) => categories.find((c) => BigInt(c.id) === id)?.name ?? `#${id}`
  const rows = [['id', 'date', 'type', 'category', 'counterparty', 'amount_usdc', 'memo', 'ref', 'recorded_by', 'voided']]
  for (const e of entries) {
    rows.push([
      e.id.toString(),
      new Date(Number(e.timestamp) * 1000).toISOString(),
      e.kind === 0 ? 'income' : 'expense',
      name(e.categoryId),
      e.counterparty,
      Amount.fromRaw(e.amount, USDC_DECIMALS).toFixed(2),
      e.memo,
      e.ref,
      e.recordedBy,
      e.voided ? 'yes' : 'no',
    ])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}
