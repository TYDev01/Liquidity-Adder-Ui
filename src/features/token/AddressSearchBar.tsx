"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidAddress } from "@/utils/validation";

/**
 * The primary token-address input. Validates format on the client before
 * allowing "Analyze", and exposes a controlled value so history/favorites can
 * populate it.
 */
export function AddressSearchBar({
  value,
  onChange,
  onAnalyze,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: (address: string) => void;
  loading?: boolean;
}) {
  const trimmed = value.trim();
  const showError = trimmed.length > 0 && !isValidAddress(trimmed);
  const canSubmit = isValidAddress(trimmed) && !loading;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onAnalyze(trimmed);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        ERC-20 Token Address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            invalid={showError}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0x… paste any token contract address"
            className="pl-10 pr-10 font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" size="md" disabled={!canSubmit} loading={loading} className="sm:w-40">
          Analyze Token
        </Button>
      </div>
      {showError && (
        <p className="text-xs text-destructive">
          That doesn&apos;t look like a valid EVM address.
        </p>
      )}
    </form>
  );
}
