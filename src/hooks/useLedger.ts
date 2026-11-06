import { useQuery } from '@tanstack/react-query'
import type { Abi, Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { ledgerAbi } from '@/contracts/abis'
import { CHAIN_ID, type Category, type Entry } from '@/lib/ledger'

const looseAbi: Abi = ledgerAbi
const ADMIN_ROLE = `0x${'0'.repeat(64)}` as const
const MAX_LOADED = 500n

export interface LedgerState {
  totalIncome: bigint
  totalExpense: bigint
  treasury: bigint
  entryCount: bigint
  paused: boolean
  categories: Category[]
  entries: Entry[]
  isAdmin: boolean
  isBookkeeper: boolean
  bookkeeperRole: `0x${string}`
}

/** Reads the whole state of one ledger from Arc Testnet. */
export function useLedger(ledger: Address | undefined, user: Address | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID })

  return useQuery({
    queryKey: ['ledger', ledger, user],
    enabled: Boolean(ledger && client),
    refetchInterval: 10_000,
    queryFn: async (): Promise<LedgerState> => {
      if (!ledger || !client) throw new Error('Ledger unavailable')
      const read = <T,>(functionName: string, args: readonly unknown[] = []) =>
        client.readContract({ address: ledger, abi: looseAbi, functionName, args }) as Promise<T>

      const [totalIncome, totalExpense, treasury, entryCount, categoryCount, paused, bookkeeperRole] = await Promise.all([
        read<bigint>('totalIncome'),
        read<bigint>('totalExpense'),
        read<bigint>('treasuryBalance'),
        read<bigint>('entryCount'),
        read<bigint>('categoryCount'),
        client.readContract({ address: ledger, abi: ledgerAbi, functionName: 'paused' }),
        client.readContract({ address: ledger, abi: ledgerAbi, functionName: 'BOOKKEEPER_ROLE' }),
      ])

      const categories = await Promise.all(
        Array.from({ length: Number(categoryCount) }, async (_, i) => {
          const [c, total] = await Promise.all([
            read<{ name: string; kind: number; active: boolean }>('getCategory', [BigInt(i)]),
            read<bigint>('categoryTotal', [BigInt(i)]),
          ])
          return { id: i, name: c.name, kind: Number(c.kind), active: c.active, total } satisfies Category
        }),
      )

      const start = entryCount > MAX_LOADED ? entryCount - MAX_LOADED : 0n
      const pages: Promise<Entry[]>[] = []
      for (let offset = start; offset < entryCount; offset += 100n) {
        pages.push(read<Entry[]>('getEntries', [offset, 100n]))
      }
      const entries = (await Promise.all(pages)).flat().map((e) => ({ ...e, kind: Number(e.kind) }))

      const [isAdmin, isBookkeeper] = user
        ? await Promise.all([
            read<boolean>('hasRole', [ADMIN_ROLE, user]),
            read<boolean>('hasRole', [bookkeeperRole, user]),
          ])
        : [false, false]

      return {
        totalIncome,
        totalExpense,
        treasury,
        entryCount,
        paused,
        categories,
        entries,
        isAdmin,
        isBookkeeper,
        bookkeeperRole,
      }
    },
  })
}
