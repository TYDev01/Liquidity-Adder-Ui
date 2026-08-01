# Universal Liquidity Manager

Create, add and remove liquidity for **any token** — by pasting its address —
across two ecosystems:

- **EVM** — Uniswap V2 (and V2-fork) pools on Ethereum, Base, Arbitrum,
  Optimism, Polygon and BNB Chain.
- **Solana** — Raydium, Orca and Meteora, chosen from a platform picker.

The app deploys no contracts and no programs of its own; it interacts directly
with each venue's existing on-chain contracts.

---

## Solana venues

Pick the ecosystem with the **EVM / Solana** toggle, then pick a venue. Each has
a different pool model, which is what changes the deposit flow:

| Venue | Model | Deposit | Create pool |
| ----------------- | ---------------- | -------------------- | ----------- |
| Raydium CPMM | Constant product | Full range | ✅ |
| Raydium CLMM | Concentrated | Price range | ✅ |
| Orca Whirlpools | Concentrated | Price range | ✅ |
| Meteora DLMM | Discrete bins | Price range + bins | ✅ |
| Meteora DAMM v2 | Constant product | Full range | ❌ ¹ |

¹ Meteora gates DAMM v2 pool creation behind an allowlisted config account that
isn't publicly available, so that venue is add/remove only. Create the pool on
Meteora's own interface, then return here to manage liquidity.

Unlike a Uniswap V2 pair — which is uniquely determined by its two tokens — every
Solana venue allows **many pools per pair**, differing by fee tier, tick spacing
or bin step. Liquidity is therefore split across them, so the app lists the
matching pools sorted by TVL and asks you to choose before depositing.

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

### Solana-specific

- 🔀 **Venue picker** — Raydium (CPMM/CLMM), Orca Whirlpools and Meteora
  (DLMM/DAMM v2), grouped by protocol and labelled by pool model.
- 🎯 **Pool picker** — every matching pool for the pair, sorted by TVL, with fee
  tier, 24h volume and APR, since liquidity is split across many pools.
- 📐 **Price ranges** — ±5/15/50% presets, full range, or hand-entered bounds for
  concentrated and bin venues, with an out-of-range warning.
- 💠 **Multi-position aware** — a wallet can hold several positions per pool;
  each is listed with its band and in/out-of-range state.
- 🪙 **Pairing choice** — pair against SOL, USDC or USDT.
- ⚠️ **Mint risk flags** — live mint/freeze authority and Token-2022 transfer
  fees surfaced before you deposit.
- 🔗 **Multi-step transactions** — actions spanning several transactions are
  signed in one prompt and sent in order, with a step counter.

## Tech stack

Next.js 15 (App Router) · TypeScript (strict) · TailwindCSS · wagmi · viem ·
RainbowKit · TanStack Query · Zustand · Framer Motion.

Solana: `@solana/web3.js` · `@solana/spl-token` · Solana Wallet Adapter
(wallets are discovered at runtime via the Wallet Standard) ·
`@raydium-io/raydium-sdk-v2` · `@orca-so/whirlpools-sdk` · `@meteora-ag/dlmm` ·
`@meteora-ag/cp-amm-sdk`.

## Architecture

```
src/
├── app/            # Next.js App Router (layout, providers, page, globals)
├── abis/           # Typed contract ABIs (ERC-20, factory, router, pair)
├── components/     # Shared UI (shadcn-style primitives + app components)
│   └── ui/
├── constants/      # App constants, the DEX/chain layer, the Solana venue layer
├── features/       # Feature-based modules
│   ├── ecosystem/  #   EVM⇄Solana toggle, selection store, shell
│   ├── token/      #   token discovery, info card, history/favorites, store
│   ├── liquidity/  #   EVM add/remove forms, pool card, tx status, stores
│   ├── solana/     #   platform picker, pool list, add/remove/create, activity
│   └── wallet/     #   connect buttons (both ecosystems), network indicator
├── hooks/          # Reusable data + transaction hooks (per ecosystem)
├── lib/            # Small framework helpers (cn)
├── services/       # Framework-agnostic logic
│   ├── blockchain/ #   wagmi config, viem public clients, RPC map
│   ├── token/      #   token metadata + price services
│   ├── uniswap/    #   pool reads + liquidity quoting
│   └── solana/     #   connection, SPL mint reads, venue adapters
│       └── adapters/  raydium, orca, meteora (+ their discovery APIs)
├── types/          # Shared TypeScript types (index.ts = EVM, solana.ts)
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

### Adding a Solana venue

The Solana side has the same seam, split in two:

1. Add a `SolanaPlatformConfig` entry to `SOLANA_PLATFORMS` in
   [`src/constants/solana.ts`](src/constants/solana.ts) (program id, pool model,
   fee tiers) and list its id in `SOLANA_PLATFORM_IDS`.
2. Implement the `LiquidityAdapter` interface from
   [`src/types/solana.ts`](src/types/solana.ts) and register it in
   [`src/services/solana/adapters/index.ts`](src/services/solana/adapters/index.ts).

The adapter owns everything venue-specific — pool discovery, quoting, and
building transactions. Hooks and UI only ever speak the adapter interface, so
the deposit flow adapts to the declared `poolModel` automatically (a
`concentrated` or `bins` venue gets the price-range control; a
`constant-product` one doesn't).

Adapters return **unsigned transactions**; signing, sending, confirmation,
staging and the activity log are handled centrally by
`useSolanaTransactionRunner`, so every venue presents identical transaction UX.

## Getting started

### Prerequisites

- Node.js 18.18+ (Node 20/22/24 all work)
- A [WalletConnect Cloud](https://cloud.walletconnect.com) project id
- **For Solana: a dedicated RPC endpoint.** The public
  `api.mainnet-beta.solana.com` is heavily rate-limited and rejects some of the
  account reads the AMM SDKs perform, so pool state and positions will load
  unreliably without one. Helius, Triton, QuickNode and Alchemy all have free
  tiers. Set it as `NEXT_PUBLIC_SOLANA_RPC_URL`; the app warns in-page when it
  is falling back to the public endpoint.

### Install & run

```bash
# 1. Install dependencies
npm install            # or: pnpm install / yarn

# 2. Configure environment
cp .env.example .env.local
#   → set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
#   → (recommended) set NEXT_PUBLIC_RPC_URL_1 etc. to your own RPC endpoints
#   → (Solana) set NEXT_PUBLIC_SOLANA_RPC_URL to a dedicated endpoint

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
- On Solana, mints are checked for a live **mint authority** (supply can be
  inflated), a live **freeze authority** (your token account can be frozen) and
  **Token-2022 transfer fees** (which silently skim every deposit). All three
  are surfaced before you deposit.
- Pool discovery uses each venue's public API for listing only; the state that
  any transaction is built against is always re-read from chain through the SDK.

> ⚠️ Anyone can deploy a token to any address. Always verify a token before
> providing liquidity — this tool does not vet token legitimacy.

> ⚠️ Providing liquidity carries real financial risk, including impermanent
> loss. On concentrated and bin venues a position earns nothing while the price
> sits outside its range. Creating a pool sets its opening price from your
> deposit ratio — if that differs from the wider market, arbitrage traders will
> correct it at your expense.

## License

MIT
# Liquidity-Adder-Ui
