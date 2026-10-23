import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import LandingRedirect from "./LandingRedirect";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Merlink — Buy and sell crypto with people near you",
  description:
    "Merlink matches you with verified crypto traders in your area. Coins sit in on-chain escrow until the cash side is settled, so neither side has to trust the other.",
  openGraph: {
    title: "Merlink — Buy and sell crypto with people near you",
    description: "Verified local traders, on-chain escrow, pay however you both agree.",
    type: "website",
  },
};

const ASSETS = ["USDC", "USDT", "SOL", "ETH", "BTC"];
const PAYMENTS = ["Bank transfer", "Cash in person", "Wise", "Revolut", "PayPal", "Mobile money"];

const STEPS = [
  {
    title: "Verify once",
    body: "Create an account and pass a quick ID check. Every trader on Merlink has done the same, so you always know who you are dealing with.",
  },
  {
    title: "Find a trader nearby",
    body: "Discover starts with sellers within 10 km and widens on its own to your city, your country, then the world. Or post what you want and let sellers come to you.",
  },
  {
    title: "Trade through escrow",
    body: "The seller locks the coins in an on-chain escrow. You pay them by bank, cash or app, mark it sent, and the coins release straight to your wallet.",
  },
];

const FEATURES = [
  {
    title: "Non-custodial escrow",
    body: "Merlink never holds your crypto. Coins sit in a smart contract until both sides are done or a dispute is settled.",
    icon: "M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6l-8-4Zm0 5a2.5 2.5 0 0 1 2.5 2.5V11h.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h.5V9.5A2.5 2.5 0 0 1 12 7Zm0 1.5a1 1 0 0 0-1 1V11h2V9.5a1 1 0 0 0-1-1Z",
  },
  {
    title: "Verified traders only",
    body: "Identity checks before anyone can trade, with badges on every profile so you can see who is verified at a glance.",
    icon: "M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.4 0 8 2.2 8 5v1H4v-1c0-2.8 3.6-5 8-5Z",
  },
  {
    title: "Pay the way you both like",
    body: "Bank transfer, cash when you meet, Wise, Revolut, PayPal or mobile money. Sellers list what they accept.",
    icon: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 3v2h18V9H3Zm2 5v2h5v-2H5Z",
  },
  {
    title: "Chat inside the trade",
    body: "Every trade has its own chat. Contact details are blocked so deals stay on the platform and under escrow.",
    icon: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  },
  {
    title: "Timers that keep it fair",
    body: "Buyers have a payment window and sellers a confirmation window. Miss one and the trade unwinds on its own.",
    icon: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 4a1 1 0 0 0-1 1v5.4l3.3 3.3 1.4-1.4-2.7-2.7V7a1 1 0 0 0-1-1Z",
  },
  {
    title: "Disputes with a human",
    body: "If something goes wrong, raise a dispute with screenshots. A reviewer looks at the evidence and settles it on-chain.",
    icon: "M12 2 3 7v5c0 5.2 3.8 9.9 9 11 5.2-1.1 9-5.8 9-11V7l-9-5Zm-1 6h2v6h-2V8Zm0 8h2v2h-2v-2Z",
  },
];

const FAQ = [
  {
    q: "Is Merlink a wallet or an exchange?",
    a: "Neither. You bring your own wallet (Phantom on Solana today) and trade directly with another person. Merlink matches you, runs the escrow and keeps the record.",
  },
  {
    q: "Does Merlink ever hold my money?",
    a: "No. The seller's crypto is locked in an on-chain escrow program, not in a Merlink account. The cash side goes directly from buyer to seller.",
  },
  {
    q: "Which coins and networks are supported?",
    a: "USDC, USDT and SOL on Solana. Ethereum and Bitcoin support is being finished. During the public beta, trades settle on Solana devnet with test tokens.",
  },
  {
    q: "Do I have to meet in person?",
    a: "No. Sellers choose in-person, remote or both. If you do meet, the escrow is already locked before you set off.",
  },
  {
    q: "What does it cost?",
    a: "Nothing during the beta. The protocol fee is set to zero while we finish audits.",
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg className={styles.featureIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <LandingRedirect />

      <header className={styles.nav}>
        <div className={`${styles.inner} ${styles.navInner}`}>
          <Link href="/" className={styles.wordmark} aria-label="Merlink home">
            Merlink
          </Link>
          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#how" className={styles.navLink}>How it works</a>
            <a href="#faq" className={styles.navLink}>FAQ</a>
            <Link href="/login" className={`${styles.btn} ${styles.btnGhost}`}>Sign in</Link>
            <Link href="/register" className={`${styles.btn} ${styles.btnPrimary}`}>Get started</Link>
          </nav>
        </div>
      </header>

      <p className={styles.beta}>
        Public beta. Trades settle on Solana devnet with test tokens while we complete audits.
      </p>

      <section className={`${styles.inner} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Peer-to-peer crypto, locally</p>
          <h1 className={styles.h1}>
            Buy and sell crypto with <span className={styles.grad}>people near you.</span>
          </h1>
          <p className={styles.lede}>
            Merlink matches you with verified traders in your area. Coins sit in on-chain escrow
            until the cash side is settled, so neither side has to trust the other.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/register" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>
              Create a free account
            </Link>
            <Link href="/login" className={`${styles.btn} ${styles.btnGhost} ${styles.btnLg}`}>
              I already have one
            </Link>
          </div>
          <ul className={styles.proof}>
            <li>ID-verified traders</li>
            <li>Non-custodial escrow</li>
            <li>Zero fees in beta</li>
          </ul>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.phone}>
            <Image
              src="/landing/discover.png"
              alt="The Merlink Discover screen listing verified sellers within 10 km"
              width={780}
              height={1688}
              priority
              className={styles.phoneImg}
            />
          </div>
        </div>
      </section>

      <section className={`${styles.inner} ${styles.strip}`} aria-label="Supported assets and payment methods">
        <div className={styles.stripGroup}>
          <span className={styles.stripLabel}>Trade</span>
          {ASSETS.map((a) => (
            <span key={a} className={styles.chipStrong}>{a}</span>
          ))}
        </div>
        <div className={styles.stripGroup}>
          <span className={styles.stripLabel}>Pay with</span>
          {PAYMENTS.map((p) => (
            <span key={p} className={styles.chip}>{p}</span>
          ))}
        </div>
      </section>

      <section id="how" className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <h2>Three steps, one escrow.</h2>
            <p>From sign-up to coins in your wallet, without handing either to a stranger.</p>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <h2>Built so neither side has to trust the other.</h2>
          </div>
          <div className={styles.features}>
            {FEATURES.map((f) => (
              <article key={f.title} className={styles.feature}>
                <Icon d={f.icon} />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.inner} ${styles.screens}`}>
          <div className={styles.screensCopy}>
            <h2>Every trade has a timeline, a timer and a chat.</h2>
            <p>
              Open a listing, check the price and limits, and start the trade. From then on you can
              see exactly where it stands: created, escrow locked, payment sent, completed. Talk to
              the other side in the trade itself, and cancel cleanly if plans change before payment.
            </p>
            <Link href="/register" className={`${styles.btn} ${styles.btnPrimary}`}>Start trading</Link>
          </div>
          <div className={styles.screensPhones}>
            <div className={styles.phoneSm}>
              <Image src="/landing/listing.png" alt="A Merlink listing with price, limits and liquidity" width={780} height={1688} className={styles.phoneImg} />
            </div>
            <div className={styles.phoneSm}>
              <Image src="/landing/trade.png" alt="A Merlink trade room with status timeline and chat" width={780} height={1688} className={styles.phoneImg} />
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className={styles.section}>
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <h2>Questions people ask first.</h2>
          </div>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div className={`${styles.inner} ${styles.ctaBandInner}`}>
          <h2>Ready to trade with someone down the road?</h2>
          <p>Create an account, verify your ID and see who is selling near you in a couple of minutes.</p>
          <Link href="/register" className={`${styles.btn} ${styles.btnLight} ${styles.btnLg}`}>Create a free account</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.inner} ${styles.footerInner}`}>
          <span className={styles.wordmark}>Merlink</span>
          <nav className={styles.footerLinks} aria-label="Footer">
            <Link href="/login">Sign in</Link>
            <Link href="/register">Create account</Link>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <p className={styles.footerNote}>© {new Date().getFullYear()} Merlink. Public beta on Solana devnet.</p>
        </div>
      </footer>
    </main>
  );
}
