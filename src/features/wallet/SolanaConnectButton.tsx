"use client";

import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/useMounted";
import { shortenAddress } from "@/utils/format";

/**
 * Solana connect button, styled to match the EVM one. Wraps the wallet-adapter
 * modal rather than rendering its default button so the header stays visually
 * consistent across ecosystems.
 */
export function SolanaConnectButton() {
  const mounted = useMounted();
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  if (!mounted) {
    // Placeholder keeps the header from shifting during hydration.
    return <div className="h-11 w-36" aria-hidden />;
  }

  if (!connected || !publicKey) {
    return (
      <Button onClick={() => setVisible(true)} size="md" loading={connecting}>
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="md"
        onClick={() => setVisible(true)}
        className="hidden sm:inline-flex"
      >
        {wallet?.adapter.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wallet.adapter.icon}
            alt={wallet.adapter.name}
            className="h-4 w-4 rounded"
          />
        )}
        Solana
      </Button>
      <Button variant="outline" size="md" onClick={() => void disconnect()}>
        {shortenAddress(publicKey.toBase58())}
      </Button>
    </div>
  );
}
