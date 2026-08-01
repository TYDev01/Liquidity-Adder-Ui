import type { FriendlyError } from "./errors";

/**
 * Maps Solana wallet / RPC / program errors to the same `FriendlyError` shape
 * the EVM side uses, so the shared status UI can render either ecosystem.
 *
 * Solana surfaces failures very differently from EVM: there are no revert
 * strings, only numeric program error codes plus a `logs` array. The mapping
 * below covers the codes the AMM programs we integrate actually emit.
 */

/** Anchor/program error codes we can explain, keyed by the venue that emits them. */
const PROGRAM_ERROR_HINTS: Array<{ match: RegExp; title: string; message: string }> = [
  {
    match: /slippage|exceeded.*limit|ExceededSlippage|max.*amount.*exceeded/i,
    title: "Price moved",
    message:
      "The pool price moved past your slippage tolerance before the transaction landed. Increase slippage or try again.",
  },
  {
    match: /insufficient funds|InsufficientFunds|0x1\b/i,
    title: "Insufficient balance",
    message:
      "You don't have enough of one of the deposit tokens, or not enough SOL to cover fees and rent.",
  },
  {
    match: /blockhash not found|BlockhashNotFound|block height exceeded/i,
    title: "Transaction expired",
    message:
      "The transaction wasn't confirmed before its blockhash expired. Nothing was spent — try again.",
  },
  {
    match: /account.*not.*found|AccountNotFound|could not find account/i,
    title: "Account missing",
    message:
      "A required token account doesn't exist yet. Retry — the transaction will create it.",
  },
  {
    match: /already in use|account already exists/i,
    title: "Pool already exists",
    message:
      "A pool with these parameters already exists. Switch to adding liquidity instead of creating.",
  },
  {
    match: /price.*out of range|TickArrayNotFound|InvalidTickIndex|invalid tick/i,
    title: "Invalid price range",
    message:
      "The price range isn't valid for this pool's tick spacing. Widen the range and try again.",
  },
  {
    match: /frozen|AccountFrozen/i,
    title: "Token account frozen",
    message:
      "This mint's freeze authority has frozen your token account. You can't deposit it.",
  },
  {
    match: /Transfer fee|TransferFeeCalculation/i,
    title: "Transfer fee mismatch",
    message:
      "This Token-2022 mint charges a transfer fee, so less arrives than you sent. Increase slippage.",
  },
  {
    match: /computational budget|exceeded CUs|compute units/i,
    title: "Transaction too large",
    message:
      "The transaction ran out of compute budget. Try a narrower price range or fewer bins.",
  },
];

/** Wallet-adapter rejection errors, which carry distinctive names. */
function isUserRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  const text = `${typeof name === "string" ? name : ""} ${
    typeof message === "string" ? message : ""
  }`;
  return /WalletSignTransactionError|user rejected|User rejected|rejected the request|declined|cancell?ed/i.test(
    text,
  );
}

/** Pull the program logs off a `SendTransactionError`, when present. */
function extractLogs(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const logs = (error as { logs?: unknown }).logs;
  if (Array.isArray(logs)) return logs.join("\n");
  const transactionLogs = (error as { transactionLogs?: unknown }).transactionLogs;
  if (Array.isArray(transactionLogs)) return transactionLogs.join("\n");
  return "";
}

export function parseSolanaError(error: unknown): FriendlyError {
  if (isUserRejection(error)) {
    return {
      title: "Transaction cancelled",
      message: "You rejected the request in your wallet.",
      isUserRejection: true,
    };
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const haystack = `${message}\n${extractLogs(error)}`;

  for (const hint of PROGRAM_ERROR_HINTS) {
    if (hint.match.test(haystack)) {
      return {
        title: hint.title,
        message: hint.message,
        isUserRejection: false,
      };
    }
  }

  // RPC transport problems — very common on the public endpoint.
  if (
    /429|rate.?limit|Too Many Requests|failed to fetch|network error|timed? out|ECONNRESET/i.test(
      haystack,
    )
  ) {
    return {
      title: "RPC error",
      message:
        "The Solana RPC endpoint is unreachable or rate-limited. Set NEXT_PUBLIC_SOLANA_RPC_URL to a dedicated endpoint.",
      isUserRejection: false,
    };
  }

  if (/simulation failed|Transaction simulation failed/i.test(haystack)) {
    return {
      title: "Simulation failed",
      message:
        message.replace(/^.*simulation failed:?\s*/i, "") ||
        "The transaction would fail on-chain. Check your amounts and balances.",
      isUserRejection: false,
    };
  }

  return {
    title: "Transaction failed",
    message: message || "The network rejected the transaction.",
    isUserRejection: false,
  };
}
