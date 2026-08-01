import { EcosystemManager } from "@/features/ecosystem/EcosystemManager";
import { APP_NAME } from "@/constants/app";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center px-4 py-10 sm:py-16">
      <section className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {APP_NAME}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          Paste a token address to create, add or remove liquidity — on Uniswap
          V2 across EVM chains, or Raydium, Orca and Meteora on Solana.
        </p>
      </section>

      <EcosystemManager />

      <footer className="mt-12 text-center text-xs text-muted-foreground">
        <p>
          Interacts directly with on-chain DEX contracts. Always verify token
          addresses — anyone can create a token.
        </p>
      </footer>
    </main>
  );
}
