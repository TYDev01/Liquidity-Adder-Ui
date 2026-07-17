import {
  BaseError,
  UserRejectedRequestError,
  InsufficientFundsError,
  ContractFunctionRevertedError,
} from "viem";

/**
 * Maps low-level wallet / RPC / revert errors to friendly, actionable
 * messages. The UI should never surface a raw stack trace.
 */

export interface FriendlyError {
  title: string;
  message: string;
  /** True for user-initiated cancellations (not real failures). */
  isUserRejection: boolean;
}

const REVERT_HINTS: Array<{ match: RegExp; message: string }> = [
  {
    match: /INSUFFICIENT_A_AMOUNT|INSUFFICIENT_B_AMOUNT|INSUFFICIENT_.*_AMOUNT/i,
    message:
      "Price moved beyond your slippage tolerance. Increase slippage or try again.",
  },
  {
    match: /EXPIRED/i,
    message: "The transaction deadline passed before it confirmed. Try again.",
  },
  {
    match: /INSUFFICIENT_LIQUIDITY/i,
    message: "The pool doesn't have enough liquidity for this action.",
  },
  {
    match: /TRANSFER_FROM_FAILED|TRANSFER_FAILED/i,
    message:
      "Token transfer failed. This token may charge a transfer fee or require a fresh approval.",
  },
  {
    match: /K\b/,
    message:
      "The pool's invariant check failed — often caused by fee-on-transfer tokens.",
  },
];

export function parseError(error: unknown): FriendlyError {
  // Plain thrown strings / Errors we generated ourselves.
  if (error instanceof Error && !(error instanceof BaseError)) {
    return {
      title: "Something went wrong",
      message: error.message,
      isUserRejection: false,
    };
  }

  if (error instanceof BaseError) {
    // 1. User rejected in wallet.
    const rejected = error.walk(
      (e) => e instanceof UserRejectedRequestError,
    );
    if (rejected) {
      return {
        title: "Transaction cancelled",
        message: "You rejected the request in your wallet.",
        isUserRejection: true,
      };
    }

    // 2. Insufficient native funds for value + gas.
    const insufficient = error.walk(
      (e) => e instanceof InsufficientFundsError,
    );
    if (insufficient) {
      return {
        title: "Insufficient funds",
        message:
          "You don't have enough native balance to cover the amount plus gas.",
        isUserRejection: false,
      };
    }

    // 3. Contract revert — try to map the reason.
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    const reason =
      revert?.reason ?? revert?.shortMessage ?? error.shortMessage ?? "";
    for (const hint of REVERT_HINTS) {
      if (hint.match.test(reason)) {
        return {
          title: "Transaction would revert",
          message: hint.message,
          isUserRejection: false,
        };
      }
    }

    // 4. Network / RPC transport failure (rate-limited, offline, CORS, timeout).
    if (
      /HTTP request failed|fetch failed|timed out|timeout|network error|Failed to fetch|429|rate limit/i.test(
        `${error.shortMessage ?? ""} ${error.message ?? ""}`,
      )
    ) {
      return {
        title: "Network error",
        message:
          "The RPC endpoint is unreachable or rate-limited. Try again, or set your own RPC URL (NEXT_PUBLIC_RPC_URL_…).",
        isUserRejection: false,
      };
    }

    // 5. Generic gas estimation failure.
    if (/gas required exceeds|cannot estimate gas|execution reverted/i.test(
      error.shortMessage ?? "",
    )) {
      return {
        title: "Gas estimation failed",
        message:
          "The transaction is likely to fail. Check your amounts, balances and approvals.",
        isUserRejection: false,
      };
    }

    return {
      title: "Transaction failed",
      message: error.shortMessage || "The network rejected the transaction.",
      isUserRejection: false,
    };
  }

  return {
    title: "Unexpected error",
    message: typeof error === "string" ? error : "An unknown error occurred.",
    isUserRejection: false,
  };
}
