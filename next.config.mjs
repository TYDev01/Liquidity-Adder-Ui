import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this project (several lockfiles exist on disk).
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      // Trust Wallet assets (token logos) and common IPFS gateways.
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "tokens.1inch.io" },
      { protocol: "https", hostname: "ipfs.io" },
    ],
  },
  webpack: (config, { webpack }) => {
    // wagmi / walletconnect pull in optional deps that Next doesn't need to bundle.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // The Coinbase/base-account connector (transitively via RainbowKit) imports
    // optional x402 payment SDKs that we don't use and aren't installed. Ignore
    // them so they don't break the build.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }),
      // Optional React Native storage dep pulled in by the MetaMask SDK.
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-async-storage\/async-storage$/,
      }),
    );
    return config;
  },
};

export default nextConfig;
