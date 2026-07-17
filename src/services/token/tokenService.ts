import {
  hexToString,
  type Address,
  type ContractFunctionParameters,
  type PublicClient,
} from "viem";
import { erc20Abi } from "@/abis/erc20";
import { erc20PermitAbi } from "@/abis/erc20Permit";
import type { TokenInfo } from "@/types";
import { getChainConfig } from "@/constants/dex";

/**
 * Token discovery service.
 *
 * Reads ERC-20 metadata + balances via multicall, defends against
 * non-standard tokens (missing methods, bytes32 name/symbol), and verifies the
 * address actually hosts contract code before trusting anything.
 */

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/** Some legacy tokens (e.g. MKR) return bytes32 instead of string. */
function decodeBytes32Maybe(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  try {
    return hexToString(value as `0x${string}`, { size: 32 }).replace(
      /\0+$/,
      "",
    );
  } catch {
    return null;
  }
}

async function readStringField(
  client: PublicClient,
  address: Address,
  functionName: "name" | "symbol",
  fallback: string,
): Promise<string> {
  try {
    const result = await client.readContract({
      address,
      abi: erc20Abi,
      functionName,
    });
    if (typeof result === "string" && result.length > 0) return result;
  } catch {
    // Retry assuming a bytes32 return type.
    try {
      const raw = await client.readContract({
        address,
        abi: [
          {
            type: "function",
            name: functionName,
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "bytes32" }],
          },
        ] as const,
        functionName,
      });
      const decoded = decodeBytes32Maybe(raw);
      if (decoded) return decoded;
    } catch {
      /* fall through to fallback */
    }
  }
  return fallback;
}

export async function fetchTokenInfo(
  client: PublicClient,
  address: Address,
  account?: Address,
): Promise<TokenInfo> {
  const chainId = await client.getChainId();

  // 1. Verify the address hosts contract bytecode.
  const bytecode = await client.getBytecode({ address });
  if (!bytecode || bytecode === "0x") {
    throw new InvalidTokenError(
      "No contract found at this address on the selected network.",
    );
  }

  // 2. Read the core numeric fields via multicall (these must exist for ERC-20).
  // The heterogeneous + conditional call list defeats viem's tuple inference,
  // so we type the list loosely and validate each result's status below.
  const contract = { address, abi: erc20Abi } as const;
  const contracts = [
    { ...contract, functionName: "decimals" },
    { ...contract, functionName: "totalSupply" },
    ...(account
      ? [{ ...contract, functionName: "balanceOf", args: [account] }]
      : []),
  ] as ContractFunctionParameters[];
  const results = await client.multicall({ allowFailure: true, contracts });

  const decimalsResult = results[0];
  const totalSupplyResult = results[1];

  if (decimalsResult?.status !== "success" || totalSupplyResult?.status !== "success") {
    throw new InvalidTokenError(
      "This contract does not implement the ERC-20 interface (missing decimals/totalSupply).",
    );
  }

  const decimals = Number(decimalsResult.result);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new InvalidTokenError("Reported token decimals are out of range.");
  }

  // 3. Read name/symbol with bytes32 fallbacks.
  const [name, symbol] = await Promise.all([
    readStringField(client, address, "name", "Unknown Token"),
    readStringField(client, address, "symbol", "???"),
  ]);

  const balance =
    account && results[2]?.status === "success"
      ? (results[2].result as bigint)
      : account
        ? 0n
        : undefined;

  // 4. Best-effort EIP-2612 permit detection.
  const supportsPermit = await detectPermit(client, address);

  return {
    address,
    name,
    symbol,
    decimals,
    totalSupply: totalSupplyResult.result as bigint,
    balance,
    supportsPermit,
    logoURI: buildLogoUri(chainId, address),
    chainId,
  };
}

async function detectPermit(
  client: PublicClient,
  address: Address,
): Promise<boolean> {
  try {
    await client.readContract({
      address,
      abi: erc20PermitAbi,
      functionName: "DOMAIN_SEPARATOR",
    });
    return true;
  } catch {
    return false;
  }
}

/** Trust Wallet asset CDN — a reliable, free logo source for most chains. */
function buildLogoUri(chainId: number, address: Address): string | undefined {
  const config = getChainConfig(chainId);
  const slug = TRUSTWALLET_SLUGS[chainId];
  if (!slug || !config) return undefined;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/assets/${address}/logo.png`;
}

const TRUSTWALLET_SLUGS: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  137: "polygon",
  56: "smartchain",
};
