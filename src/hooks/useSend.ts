import { useCallback, useState } from 'react'
import { encodeFunctionData, type Abi, type Address } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CHAIN_ID, parseOnchainError } from '@/lib/ledger'

export interface SendCall {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export type SendStatus = 'idle' | 'wallet' | 'confirming'

/** Sends a contract write on Arc Testnet with real wallet and receipt states. */
export function useSend() {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SendStatus>('idle')
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>()

  const send = useCallback(
    async (call: SendCall): Promise<`0x${string}` | undefined> => {
      if (!address || !publicClient) {
        toast.error('Connect your wallet first.')
        return undefined
      }
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        setStatus('wallet')
        const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args })
        const hash = await sendTransactionAsync({ to: call.address, data, chainId: CHAIN_ID })
        setLastHash(hash)
        setStatus('confirming')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        await queryClient.invalidateQueries()
        return hash
      } catch (error) {
        const message = parseOnchainError(error)
        if (message === 'Cancelled in wallet.') toast(message)
        else toast.error(message)
        return undefined
      } finally {
        setStatus('idle')
      }
    },
    [address, chainId, publicClient, queryClient, sendTransactionAsync, switchChainAsync],
  )

  return { send, status, busy: status !== 'idle', lastHash }
}
