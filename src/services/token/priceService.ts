import { getChainConfig } from "@/constants/dex";

/**
 * Best-effort USD price feed via CoinGecko's free public API. Used only for
 * display enrichment (gas in USD, token/ETH USD prices) — never for on-chain
 * math. Failures are swallowed and surfaced as `undefined`.
 */

const COINGECKO = "https://api.coingecko.com/api/v3";

/** USD price of a chain's native asset (ETH, BNB, POL, ...). */
export async function fetchNativeUsdPrice(
  chainId: number,
): Promise<number | undefined> {
  const id = getChainConfig(chainId).coingeckoNativeId;
  if (!id) return undefined;
  return fetchSimplePrice(id);
}

/** USD price of an ERC-20 by contract address, if CoinGecko indexes it. */
export async function fetchTokenUsdPrice(
  chainId: number,
  address: string,
): Promise<number | undefined> {
  const platform = getChainConfig(chainId).coingeckoPlatform;
  if (!platform) return undefined;
  try {
    const res = await fetch(
      `${COINGECKO}/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    return data[address.toLowerCase()]?.usd;
  } catch {
    return undefined;
  }
}

async function fetchSimplePrice(id: string): Promise<number | undefined> {
  try {
    const res = await fetch(
      `${COINGECKO}/simple/price?ids=${id}&vs_currencies=usd`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    return data[id]?.usd;
  } catch {
    return undefined;
  }
}
