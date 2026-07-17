"use client";

import { useEffect, useState } from "react";

/**
 * True only after the first client render. Used to avoid hydration mismatches
 * for wallet/persisted state that differs between server and client.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
