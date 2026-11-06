import { useCallback, useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { BooksPicker } from '@/components/BooksPicker'
import { Dashboard } from '@/components/Dashboard'
import { Header } from '@/components/Header'

function readLedgerParam(): Address | undefined {
  const value = new URLSearchParams(window.location.search).get('ledger')
  return value && isAddress(value) ? value : undefined
}

export default function App() {
  const [ledger, setLedger] = useState<Address | undefined>(readLedgerParam)

  useEffect(() => {
    const onPop = () => setLedger(readLedgerParam())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = useCallback((address: Address | undefined) => {
    const url = new URL(window.location.href)
    if (address) url.searchParams.set('ledger', address)
    else url.searchParams.delete('ledger')
    window.history.pushState({}, '', url)
    setLedger(address)
  }, [])

  return (
    <div className="min-h-dvh">
      <Header />
      {ledger ? <Dashboard ledger={ledger} onBack={() => open(undefined)} /> : <BooksPicker onOpen={open} />}
    </div>
  )
}
