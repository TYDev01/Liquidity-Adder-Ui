import { Connection, PublicKey } from "@solana/web3.js";
import type { SolanaPlatformId } from "@/constants/solana";
import { getPlatformConfig } from "@/constants/solana";
import type { SolanaTokenInfo } from "@/types/solana";

/**
 * Token-2022 mint-extension gating.
 *
 * AMM programs can't safely support arbitrary mint extensions — a transfer
 * hook or a permanent delegate changes what a "deposit" means — so each one
 * accepts a fixed set and rejects everything else at the instruction level.
 * Raydium's programs additionally consult a per-mint registry account, which
 * is how they enable specific mints beyond the built-in list.
 *
 * Discovering this after the user has signed is a poor trade: the failure
 * arrives as an opaque `NotSupportMint` (0x1777). This module answers the same
 * question up front.
 */

/** Extensions the venue's program accepts without a registry entry. */
const BUILT_IN_SUPPORT: Partial<Record<SolanaPlatformId, readonly string[]>> = {
  "raydium-cpmm": ["TransferFeeConfig", "MetadataPointer", "TokenMetadata"],
  "raydium-clmm": ["TransferFeeConfig", "MetadataPointer", "TokenMetadata"],
};

/** Venues whose programs expose the `support_mint` registry escape hatch. */
const HAS_MINT_REGISTRY: readonly SolanaPlatformId[] = [
  "raydium-cpmm",
  "raydium-clmm",
];

const SUPPORT_MINT_SEED = Buffer.from("support_mint", "utf8");

/** The registry account Raydium creates to enable an otherwise-blocked mint. */
export function supportMintAddress(
  programId: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SUPPORT_MINT_SEED, mint.toBuffer()],
    programId,
  )[0];
}

export interface UnsupportedMint {
  mint: string;
  symbol: string;
  /** The extensions this venue won't accept, by name. */
  extensions: string[];
}

/**
 * The first of `tokens` the venue's program will reject, or undefined when the
 * pair is fine. Reads chain state only when a mint actually carries extensions
 * outside the built-in list.
 */
export async function findUnsupportedMint(
  connection: Connection,
  platform: SolanaPlatformId,
  tokens: SolanaTokenInfo[],
): Promise<UnsupportedMint | undefined> {
  const allowed = BUILT_IN_SUPPORT[platform];
  // Venues we haven't mapped are left alone: a wrong "unsupported" verdict
  // blocks a pool that would have worked.
  if (!allowed) return undefined;

  for (const token of tokens) {
    if (!token.isToken2022) continue;

    const extensions = token.extensions ?? [];
    const blocked = extensions.filter((e) => !allowed.includes(e));
    if (blocked.length === 0) continue;

    if (await isRegisteredMint(connection, platform, token.mint)) continue;

    return { mint: token.mint, symbol: token.symbol, extensions: blocked };
  }

  return undefined;
}

/** Whether the venue has enabled this specific mint via its registry. */
export async function isRegisteredMint(
  connection: Connection,
  platform: SolanaPlatformId,
  mint: string,
): Promise<boolean> {
  if (!HAS_MINT_REGISTRY.includes(platform)) return false;

  const programId = new PublicKey(getPlatformConfig(platform).programId);
  const account = await connection.getAccountInfo(
    supportMintAddress(programId, new PublicKey(mint)),
  );
  return account !== null;
}

/** Human-readable reason, for both the pre-flight UI and thrown errors. */
export function unsupportedMintMessage(
  platform: SolanaPlatformId,
  blocked: UnsupportedMint,
): string {
  const venue = getPlatformConfig(platform).name;
  return (
    `${blocked.symbol} is a Token-2022 mint using ${listExtensions(blocked.extensions)}, ` +
    `which ${venue} refuses on new pools unless Raydium has allowlisted the mint. ` +
    `Try a venue that supports the extension, or use a pool that already exists.`
  );
}

function listExtensions(extensions: string[]): string {
  const readable = extensions.map(humanExtension);
  if (readable.length === 1) return `the ${readable[0]} extension`;
  return `the ${readable.slice(0, -1).join(", ")} and ${readable.at(-1)} extensions`;
}

/** `TransferHook` → `transfer hook`. */
function humanExtension(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}
