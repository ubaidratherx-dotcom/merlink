import styles from "./layout.module.css";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.logo}>
        <h1 className={styles.logoText}>Merlink</h1>
        <p className={styles.subtitle}>Peer-to-peer crypto trading</p>
      </div>
      <div className={styles.card}>{children}</div>
    </div>
  );
}
