# Ledgerline

An onchain bookkeeping app on Arc Testnet. Create a set of books, record USDC income with categories and invoice references, pay expenses from a shared treasury, void mistakes with a reason, and export the ledger to CSV. Every entry is public and permanent.

Built with [Arc Studio](https://studio.arc.io)

Live app: https://ashiis0-app-eac73875-adc7-44a3-8acd-0f54d5e1423b.static.hf.space

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit. Solidity contracts built with Foundry.

## Development

Prerequisites: Bun and Foundry.

```bash
bun install
bun run dev
```

Environment variables:

- `VITE_LEDGER_FACTORY_ADDRESS`: address of the deployed ledger factory on Arc Testnet.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio; optional outside Arc Studio.

Build the contracts with `bun run contracts:build` and run their tests with `bun run contracts:test`.
