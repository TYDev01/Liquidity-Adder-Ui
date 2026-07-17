# Universal Liquidity Manager

Create, add and remove **Uniswap V2** liquidity for **any ERC-20 token** on
Ethereum — simply by pasting the token's contract address. The app deploys no
contracts of its own; it interacts directly with the existing DEX factory,
router and pair contracts.

Built to be **multi-chain / multi-DEX ready**: Base, Arbitrum, Optimism, Polygon
and BNB Chain are pre-wired and enabled through a single configuration layer.

---

## Features

- 🔎 **Analyze any token** — paste an address, get name / symbol / decimals /
  total supply / your balance, with validation against non-ERC-20 contracts.
- 🌊 **Pool detection** — resolves the token/WETH pair via the V2 factory and
  shows reserves, price and an estimated TVL.
- ➕ **Create / add liquidity** — `addLiquidityETH` with slippage, deadline, LP
  preview, pool-share and price-impact.
- ➖ **Remove liquidity** — percentage slider (25/50/75/100%) with min-received
  preview and LP approval flow.
- 🧾 **Full transaction UX** — preparing → wallet → broadcasting → pending →
  confirmed/failed, each with an explorer link.
- ⛽ **Gas estimates** — gas cost in native + USD and a rough confirmation time.
- 🕑 **History, favorites & activity** — recent searches, starred tokens and a
  local transaction log, all persisted.
- 🛡️ **Safe by default** — address validation, transaction simulation before
  sending, duplicate-submission guards and friendly error mapping.
- 🔌 **EIP-2612 detection** — permit-capable tokens are detected (with graceful
  fallback to `approve()`), and the architecture leaves room for Permit2.

## Tech stack

Next.js 15 (App Router) · TypeScript (strict) · TailwindCSS · wagmi · viem ·
RainbowKit · TanStack Query · Zustand · Framer Motion.

## Architecture

```
src/
├── app/            # Next.js App Router (layout, providers, page, globals)
├── abis/           # Typed contract ABIs (ERC-20, factory, router, pair)
├── components/     # Shared UI (shadcn-style primitives + app components)
│   └── ui/
├── constants/      # App constants + the DEX/chain configuration layer
├── features/       # Feature-based modules
│   ├── token/      #   token discovery, info card, history/favorites, store
│   ├── liquidity/  #   add/remove forms, pool card, tx status, stores
│   └── wallet/     #   connect button, network indicator
├── hooks/          # Reusable data + transaction hooks
├── lib/            # Small framework helpers (cn)
├── services/       # Framework-agnostic logic
│   ├── blockchain/ #   wagmi config, viem public clients, RPC map
│   ├── token/      #   token metadata + price services
│   └── uniswap/    #   pool reads + liquidity quoting
├── types/          # Shared TypeScript types
└── utils/          # Pure helpers (format, validation, errors, math)
```

### Adding a new chain or DEX

Everything chain/DEX-specific lives in [`src/constants/dex.ts`](src/constants/dex.ts).
To add a V2-fork DEX or a new EVM chain:

1. Add a `ChainConfig` entry to `CHAIN_CONFIGS` (factory, router, WETH,
   explorer, fee).
2. Add its id to `SUPPORTED_CHAIN_IDS`.
3. Ensure the chain exists in wagmi/viem's chain list (it's mapped in
   `services/blockchain/wagmi.ts` and `publicClient.ts`).

No changes to services, hooks or UI are required — they all read from the
config layer.

## Getting started

### Prerequisites

- Node.js 18.18+ (Node 20/22/24 all work)
- A [WalletConnect Cloud](https://cloud.walletconnect.com) project id

### Install & run

```bash
# 1. Install dependencies
npm install            # or: pnpm install / yarn

# 2. Configure environment
cp .env.example .env.local
#   → set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
#   → (recommended) set NEXT_PUBLIC_RPC_URL_1 etc. to your own RPC endpoints

# 3. Start the dev server
npm run dev            # http://localhost:3000
```

### Scripts

| Script              | Description                       |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the dev server              |
| `npm run build`     | Production build                  |
| `npm run start`     | Serve the production build        |
| `npm run lint`      | ESLint                            |
| `npm run typecheck` | `tsc --noEmit` type check         |

## Environment variables

See [`.env.example`](.env.example). Only the WalletConnect project id is
required; RPC URLs are optional overrides (public RPCs are used as a fallback,
but a dedicated RPC is strongly recommended for reliability).

## Security notes

- All addresses are validated and checksummed; contracts are probed for
  bytecode and the ERC-20 interface before being trusted.
- Every write is **simulated** before signing so reverts surface early.
- Duplicate submissions and double-clicks are guarded in the shared
  transaction runner.
- No private keys are ever handled by the app — signing is delegated entirely
  to the user's wallet via wagmi/RainbowKit.
- USD/price data is used for display only and never for on-chain math.

> ⚠️ Anyone can deploy a token to any address. Always verify a token before
> providing liquidity — this tool does not vet token legitimacy.

## License

MIT
# Liquidity-Adder-Ui
