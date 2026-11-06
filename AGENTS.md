# Ledgerline: onchain bookkeeping

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Each user creates their own set of books (an `OnchainLedger` contract, deployed via `LedgerFactory`). Income is deposited as USDC with a category, memo and invoice reference; bookkeepers pay expenses from the treasury; mistakes are voided with a reason (totals change, history stays, no USDC moves).

## Deployed Contracts (Arc Testnet)

- `LedgerFactory`: 0x4a43df89719b14b4dabfdb5f7728e8f48181deab (constructor arg: Arc Testnet USDC). Address is read by the app from `VITE_LEDGER_FACTORY_ADDRESS` in `.env`.
- `OnchainLedger` instances are created by users through the factory; the creator is admin and bookkeeper.
- ABIs live in `src/contracts/abis.ts` (generated from `contracts/out`); regenerate after changing a contract.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Routes between the books picker and a ledger dashboard (`?ledger=0x...`)
- `src/hooks/useLedger.ts`, `src/hooks/useSend.ts` - ledger reads and transaction sending
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```
