You are an expert Senior Web3 Full-Stack Engineer specializing in Next.js, TypeScript, React, wagmi, viem, WalletConnect, RainbowKit, Ethereum, Solidity integrations, and DeFi protocols.

Your task is to build a production-quality decentralized web application called **Universal Liquidity Manager**.

The application allows users to create or add liquidity and remove liquidity to ANY ERC-20 token on Ethereum simply by providing the token contract address.

The application must NOT deploy any contracts. It should interact directly with existing DEX contracts.

=====================================================
PROJECT STACK
=====================================================

Frontend
- Next.js 15 (App Router)
- TypeScript
- TailwindCSS
- shadcn/ui
- wagmi
- viem
- RainbowKit
- React Query
- Zustand for state management
- Framer Motion for animations

Blockchain
- Ethereum Mainnet
- viem Public Client
- viem Wallet Client

DEX
- Uniswap V2
- Must be architected so SushiSwap, PancakeSwap, Base, Arbitrum and other V2 forks can easily be added later.

=====================================================
PROJECT GOAL
=====================================================

The application should allow a user to:

1. Connect wallet.
2. Paste any ERC20 contract address.
3. Automatically fetch token information.
4. Detect whether liquidity already exists.
5. Display liquidity information.
6. Allow user to create liquidity if none exists.
7. Allow user to add liquidity if pool exists.
8. Display transaction progress.
9. Show success/failure.
10. Display LP tokens received.

=====================================================
PROJECT STRUCTURE
=====================================================

Use a scalable architecture.

app/

components/

features/
    token/
    liquidity/
    wallet/
    dex/

hooks/

services/
    blockchain/
    uniswap/
    token/

types/

utils/

constants/

abis/

=====================================================
UI DESIGN
=====================================================

Modern DeFi dashboard.

Dark theme.

Large centered card.

Gradient background.

Rounded cards.

Professional animations.

Responsive.

Looks similar to:

- Uniswap
- PancakeSwap
- Aerodrome

=====================================================
MAIN SCREEN
=====================================================

Header

Logo

Connect Wallet button

Network indicator

-----------------------------------------------------

Main Card

Input

"ERC20 Token Address"

Button

Analyze Token

-----------------------------------------------------

After analysis display

Token Logo (if available)

Name

Symbol

Decimals

Total Supply

Contract Address

Verified status

=====================================================
TOKEN VALIDATION
=====================================================

When user enters an address:

Validate

- address format
- contract exists
- ERC20 methods exist

Read

name()

symbol()

decimals()

totalSupply()

balanceOf(user)

If invalid

Show clean error.

=====================================================
POOL DETECTION
=====================================================

Use Uniswap Factory.

Call

getPair(token, WETH)

If pair == zero address

Display

"No liquidity pool exists."

Show

"Create Liquidity"

Otherwise

Read Pair Contract

Display

Reserve Token

Reserve ETH

Current Price

Pool Address

TVL estimate

=====================================================
CREATE LIQUIDITY
=====================================================

Allow user to enter

Token Amount

ETH Amount

Slippage

Deadline

Preview

Expected LP tokens

Approve token.

Wait for confirmation.

Call

addLiquidityETH()

Handle

minimum amounts

slippage

deadline

Show pending state.

Show success animation.

=====================================================
ADD LIQUIDITY
=====================================================

If pool exists

Display

Current reserves

User balances

User LP balance

Allow entering

Token amount

ETH amount

Preview LP received

Approve

Add Liquidity

=====================================================
REMOVE LIQUIDITY
=====================================================

Allow

Percentage slider

25%

50%

75%

100%

Preview

Expected Token

Expected ETH

Approve LP token

Call removeLiquidityETH()

=====================================================
TRANSACTION UX
=====================================================

Every transaction should have

Preparing

Wallet confirmation

Broadcasting

Pending

Confirmed

Failed

Show Etherscan link.

=====================================================
ERROR HANDLING
=====================================================

Handle

Rejected wallet

RPC errors

Insufficient ETH

Insufficient tokens

Slippage exceeded

Expired deadline

Gas estimation failure

Invalid contract

Reverted transactions

Display friendly messages.

=====================================================
ADVANCED FEATURES
=====================================================

Estimate gas before sending.

Display

Gas cost

Gas in USD

Estimated transaction duration

=====================================================
TOKEN SEARCH HISTORY
=====================================================

Store recent searches.

Display latest five.

=====================================================
FAVORITES
=====================================================

Allow starring favorite tokens.

Persist locally.

=====================================================
RECENT TRANSACTIONS
=====================================================

Store locally.

Display

Hash

Date

Status

Action

=====================================================
MULTI-CHAIN READY
=====================================================

Architecture should support

Ethereum

Base

Arbitrum

Optimism

Polygon

BNB Chain

by only changing configuration.

Do NOT hardcode chain logic.

=====================================================
DEX CONFIGURATION
=====================================================

Create a configuration layer.

Example

Ethereum

Factory

Router

WETH

Chain ID

Explorer

Future DEXes should be added by configuration only.

=====================================================
CODE QUALITY
=====================================================

Use

Reusable hooks

Reusable components

Strict TypeScript

No duplicated logic

SOLID principles

Feature-based architecture

Proper error boundaries

Loading skeletons

Optimistic UI where appropriate

=====================================================
SECURITY
=====================================================

Validate addresses.

Never trust frontend input.

Prevent duplicate transactions.

Prevent multiple clicks.

Always simulate transaction before sending when possible.

Never expose private keys.

=====================================================
EXTRA FEATURES
=====================================================

Display

Pool APR (if obtainable)

Price Impact

Minimum received

Maximum slippage

Share of Pool after adding liquidity

Current token price

ETH price

=====================================================
OPTIONAL ENHANCEMENTS
=====================================================

Support EIP-2612 Permit when available.

Fallback to approve() when Permit is unavailable.

Design the architecture so Permit2 support can be added later.

=====================================================
DELIVERABLES
=====================================================

Produce:

1. Complete project structure.

2. All reusable hooks.

3. All reusable components.

4. Blockchain service layer.

5. Uniswap integration layer.

6. Utility functions.

7. Type definitions.

8. ABIs.

9. Tailwind UI.

10. Clean comments.

11. README with setup instructions.

12. Environment variable template.

13. Modular architecture suitable for production.

Do not produce placeholder code. Implement complete, working, production-quality code using best practices. Separate concerns cleanly and ensure every module is extensible for additional DEXes and EVM chains in the future.