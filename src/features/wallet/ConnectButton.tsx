"use client";

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ChevronDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/utils/format";

/**
 * Wraps RainbowKit's ConnectButton in our own styling so the header stays
 * visually consistent, while delegating all wallet logic to RainbowKit.
 */
export function ConnectButton() {
  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            aria-hidden={!ready}
            className={!ready ? "pointer-events-none opacity-0" : ""}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button onClick={openConnectModal} size="md">
                    <Wallet className="h-4 w-4" />
                    Connect Wallet
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button variant="destructive" size="md" onClick={openChainModal}>
                    <AlertTriangle className="h-4 w-4" />
                    Wrong network
                  </Button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={openChainModal}
                    className="hidden sm:inline-flex"
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={chain.name ?? "chain"}
                        src={chain.iconUrl}
                        className="h-4 w-4 rounded-full"
                      />
                    )}
                    {chain.name}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                  <Button variant="outline" size="md" onClick={openAccountModal}>
                    {shortenAddress(account.address)}
                    {account.displayBalance ? (
                      <span className="hidden text-muted-foreground md:inline">
                        {account.displayBalance}
                      </span>
                    ) : null}
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
