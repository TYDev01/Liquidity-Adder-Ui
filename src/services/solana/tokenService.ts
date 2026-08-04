import {
  Connection,
  PublicKey,
  type AccountInfo,
} from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getTransferFeeConfig,
  ExtensionType,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  type Mint,
} from "@solana/spl-token";
import type { SolanaTokenInfo } from "@/types/solana";
import { QUOTE_ASSETS, SOL_MINT } from "@/constants/solana";

/**
 * SPL mint discovery — the Solana counterpart to `services/token/tokenService.ts`.
 *
 * Metadata on Solana is not part of the mint account, so name/symbol/logo are
 * resolved from (in order): a token-list API, the Token-2022 metadata
 * extension, then the Metaplex metadata PDA. Everything that matters for
 * on-chain math (decimals, supply, authorities, transfer fees) comes from the
 * mint account itself and is never trusted to the API.
 */

const METAPLEX_METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

/** Jupiter's token metadata endpoint — no key required. */
const TOKEN_LIST_ENDPOINT = "https://lite-api.jup.ag/tokens/v2/search?query=";

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

/** Parse a base58 mint address, returning undefined when malformed. */
export function parseMint(value: string | undefined): PublicKey | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  // Fail fast on obvious non-base58 input (e.g. an EVM address pasted here).
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return undefined;
  try {
    const key = new PublicKey(trimmed);
    // Reject curve points that aren't valid account addresses.
    return key.toBase58() === trimmed ? key : undefined;
  } catch {
    return undefined;
  }
}

export function isValidMint(value: string | undefined): boolean {
  return parseMint(value) !== undefined;
}

/* -------------------------------------------------------------------------- */
/*                              Mint account read                             */
/* -------------------------------------------------------------------------- */

interface MintRead {
  mint: Mint;
  programId: PublicKey;
  isToken2022: boolean;
}

/**
 * Read a mint account, detecting whether it belongs to the legacy Token
 * program or Token-2022. Throws a friendly error when the address isn't a mint.
 */
async function readMint(
  connection: Connection,
  mintKey: PublicKey,
): Promise<MintRead> {
  const account = await connection.getAccountInfo(mintKey);
  if (!account) {
    throw new Error(
      "No account exists at this address on mainnet. Check the mint address.",
    );
  }

  const owner = account.owner;
  const isToken2022 = owner.equals(TOKEN_2022_PROGRAM_ID);
  if (!isToken2022 && !owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error(
      "This address is not an SPL token mint — it's owned by another program.",
    );
  }

  try {
    const mint = await getMint(connection, mintKey, undefined, owner);
    return { mint, programId: owner, isToken2022 };
  } catch {
    throw new Error(
      "This address is a token account or program state, not a mint. Paste the mint address.",
    );
  }
}

/**
 * Names of the Token-2022 extensions a mint carries. AMM programs accept only
 * a small set of these, so the list decides which venues can host the token.
 */
function readExtensions(mint: Mint): string[] {
  try {
    return getExtensionTypes(mint.tlvData).map(
      (type) => ExtensionType[type] ?? `Unknown (${type})`,
    );
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Metadata                                  */
/* -------------------------------------------------------------------------- */

interface TokenMetadata {
  name?: string;
  symbol?: string;
  logoURI?: string;
}

/** Look the mint up in a public token list. Best-effort; never throws. */
async function fetchListMetadata(mint: string): Promise<TokenMetadata> {
  try {
    const res = await fetch(`${TOKEN_LIST_ENDPOINT}${mint}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return {};
    const body = (await res.json()) as unknown;
    const entries = Array.isArray(body) ? body : [];
    const hit = entries.find(
      (e): e is Record<string, unknown> =>
        typeof e === "object" &&
        e !== null &&
        (e as Record<string, unknown>).id === mint,
    );
    if (!hit) return {};
    return {
      name: typeof hit.name === "string" ? hit.name : undefined,
      symbol: typeof hit.symbol === "string" ? hit.symbol : undefined,
      logoURI: typeof hit.icon === "string" ? hit.icon : undefined,
    };
  } catch {
    return {};
  }
}

/** Read a borsh `string` (u32 LE length prefix) and strip null padding. */
function readBorshString(
  data: Buffer,
  offset: number,
): { value: string; next: number } {
  const length = data.readUInt32LE(offset);
  const start = offset + 4;
  const raw = data.subarray(start, start + length).toString("utf8");
  return { value: raw.replace(/\0/g, "").trim(), next: start + length };
}

/**
 * Decode the fields we need out of a Metaplex Metadata account. Hand-rolled
 * rather than pulling in the full Metaplex SDK for three strings.
 *
 * Layout: key(1) | updateAuthority(32) | mint(32) | name | symbol | uri | …
 */
function decodeMetaplexMetadata(
  account: AccountInfo<Buffer>,
): TokenMetadata {
  try {
    const data = account.data;
    let offset = 1 + 32 + 32;
    const name = readBorshString(data, offset);
    offset = name.next;
    const symbol = readBorshString(data, offset);
    offset = symbol.next;
    const uri = readBorshString(data, offset);
    return {
      name: name.value || undefined,
      symbol: symbol.value || undefined,
      logoURI: uri.value || undefined,
    };
  } catch {
    return {};
  }
}

async function fetchOnChainMetadata(
  connection: Connection,
  mintKey: PublicKey,
): Promise<TokenMetadata> {
  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METAPLEX_METADATA_PROGRAM.toBuffer(),
        mintKey.toBuffer(),
      ],
      METAPLEX_METADATA_PROGRAM,
    );
    const account = await connection.getAccountInfo(pda);
    if (!account) return {};
    const meta = decodeMetaplexMetadata(account as AccountInfo<Buffer>);
    // The `uri` points at off-chain JSON; resolve the image lazily elsewhere.
    return { name: meta.name, symbol: meta.symbol };
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Balances                                  */
/* -------------------------------------------------------------------------- */

/** Read an owner's balance of a mint. Returns 0n when no ATA exists yet. */
export async function fetchTokenBalance(
  connection: Connection,
  mintKey: PublicKey,
  owner: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<bigint> {
  try {
    const ata = getAssociatedTokenAddressSync(
      mintKey,
      owner,
      true,
      programId,
    );
    const account = await getAccount(connection, ata, undefined, programId);
    return account.amount;
  } catch {
    return 0n;
  }
}

/**
 * Every non-zero token balance the owner holds, keyed by mint. Covers both
 * token programs, since a wallet's positions can be denominated in either.
 *
 * One `getTokenAccountsByOwner` call per program is far cheaper than reading
 * candidate mints individually, which is what position discovery would
 * otherwise need.
 */
export async function fetchTokenBalances(
  connection: Connection,
  owner: PublicKey,
): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();

  const responses = await Promise.allSettled(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }),
    ),
  );

  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const { account } of response.value.value) {
      const info = account.data.parsed?.info;
      const mint = info?.mint;
      const amount = info?.tokenAmount?.amount;
      if (typeof mint !== "string" || typeof amount !== "string") continue;

      const value = BigInt(amount);
      if (value > 0n) balances.set(mint, value);
    }
  }

  return balances;
}

/** Native SOL balance in lamports. */
export async function fetchSolBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<bigint> {
  const lamports = await connection.getBalance(owner);
  return BigInt(lamports);
}

/* -------------------------------------------------------------------------- */
/*                                Public entry                                */
/* -------------------------------------------------------------------------- */

/**
 * Full token discovery: mint state, metadata and (when an owner is given) the
 * connected wallet's balance.
 */
export async function fetchSolanaTokenInfo(
  connection: Connection,
  mintAddress: string,
  owner?: PublicKey,
): Promise<SolanaTokenInfo> {
  const mintKey = parseMint(mintAddress);
  if (!mintKey) {
    throw new Error("Not a valid Solana address. Mint addresses are base58.");
  }

  const { mint, programId, isToken2022 } = await readMint(connection, mintKey);
  const base58 = mintKey.toBase58();

  const [listMeta, balance] = await Promise.all([
    fetchListMetadata(base58),
    owner
      ? base58 === SOL_MINT
        ? fetchSolBalance(connection, owner)
        : fetchTokenBalance(connection, mintKey, owner, programId)
      : Promise.resolve(undefined),
  ]);

  // Only pay for the on-chain metadata read when the list didn't resolve a name.
  const meta =
    listMeta.symbol && listMeta.name
      ? listMeta
      : {
          ...(await fetchOnChainMetadata(connection, mintKey)),
          ...listMeta,
        };

  const transferFee = isToken2022
    ? getTransferFeeConfig(mint)
    : null;

  return {
    extensions: isToken2022 ? readExtensions(mint) : undefined,
    mint: base58,
    name: meta.name ?? `Unknown token ${base58.slice(0, 4)}`,
    symbol: meta.symbol ?? base58.slice(0, 4).toUpperCase(),
    decimals: mint.decimals,
    supply: mint.supply,
    balance,
    logoURI: meta.logoURI,
    isToken2022,
    transferFeeBps:
      transferFee?.newerTransferFee.transferFeeBasisPoints ?? undefined,
    hasMintAuthority: mint.mintAuthority !== null,
    hasFreezeAuthority: mint.freezeAuthority !== null,
  };
}

/**
 * Build a `SolanaTokenInfo` for one of the well-known quote assets without a
 * round-trip for metadata.
 */
export async function fetchQuoteAssetInfo(
  connection: Connection,
  mintAddress: string,
  owner?: PublicKey,
): Promise<SolanaTokenInfo> {
  const known = QUOTE_ASSETS.find((q) => q.mint === mintAddress);
  if (!known) return fetchSolanaTokenInfo(connection, mintAddress, owner);

  const mintKey = new PublicKey(known.mint);
  const balance = owner
    ? known.mint === SOL_MINT
      ? await fetchSolBalance(connection, owner)
      : await fetchTokenBalance(connection, mintKey, owner)
    : undefined;

  return {
    mint: known.mint,
    name: known.symbol,
    symbol: known.symbol,
    decimals: known.decimals,
    supply: 0n,
    balance,
    logoURI: known.logoURI,
    isToken2022: false,
    hasMintAuthority: false,
    hasFreezeAuthority: false,
  };
}
