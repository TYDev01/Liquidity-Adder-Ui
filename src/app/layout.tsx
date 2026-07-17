import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { APP_NAME, APP_DESCRIPTION } from "@/constants/app";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: `${APP_NAME} — Liquidity for any ERC-20`,
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: "#0b0b12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          <div className="app-backdrop">
            <Header />
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </Providers>
      </body>
    </html>
  );
}
