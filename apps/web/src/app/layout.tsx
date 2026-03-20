import type { Metadata } from "next";
import { Inter } from "next/font/google";
import WalletProvider from "@/providers/WalletProvider";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Merlink — P2P Crypto Trading",
  description:
    "Location-based P2P crypto trading marketplace. Buy and sell crypto securely with non-custodial escrow on Solana.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
          <WalletProvider>{children}</WalletProvider>
        </body>
    </html>
  );
}
