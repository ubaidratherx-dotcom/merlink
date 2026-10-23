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
    "Location-based P2P crypto trading marketplace. Buy and sell crypto securely with non-custodial escrow.",
  manifest: "/manifest.json",
  themeColor: "#7B5EFF",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Merlink",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <WalletProvider>{children}</WalletProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                // Unregister old SW to prevent interference
                navigator.serviceWorker.getRegistrations().then(regs => {
                  regs.forEach(r => r.unregister());
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
