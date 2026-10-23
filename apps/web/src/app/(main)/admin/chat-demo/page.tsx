"use client";

import { useState } from "react";

const MOCK_MESSAGES = [
  // Pre-dispute chat
  { id: "1", sender: "buyer", username: "buyer123", content: "Hey, I'm ready to buy 2 SOL. Sending via bank transfer now.", time: "1:30 PM" },
  { id: "2", sender: "seller", username: "tvs", content: "Perfect, escrow is locked. Send to the account details I shared.", time: "1:31 PM" },
  { id: "3", sender: "buyer", username: "buyer123", content: "Sent! Transaction ref: TXN-2024-8847291", time: "1:45 PM" },
  { id: "4", sender: "buyer", username: "buyer123", content: "Can you check your bank?", time: "2:00 PM" },
  { id: "5", sender: "seller", username: "tvs", content: "Nothing yet. Are you sure you sent to the right account?", time: "2:05 PM" },
  { id: "6", sender: "buyer", username: "buyer123", content: "Yes I double checked. Here's my receipt", time: "2:07 PM" },
  { id: "7", sender: "buyer", username: "buyer123", content: "[Screenshot: bank_receipt.png]", time: "2:07 PM", isImage: true },
  { id: "8", sender: "seller", username: "tvs", content: "That's not my account number. You sent it to the wrong account.", time: "2:10 PM" },
  { id: "9", sender: "buyer", username: "buyer123", content: "What? I copied exactly what you said. Look at your payment instructions.", time: "2:11 PM" },
  { id: "10", sender: "seller", username: "tvs", content: "My account ends in 4521 not 4512. You swapped the digits.", time: "2:12 PM" },
  { id: "11", sender: "buyer", username: "buyer123", content: "That's your fault for giving wrong details! I want my money back or release the escrow.", time: "2:14 PM" },
  { id: "12", sender: "seller", username: "tvs", content: "I didn't give wrong details. Check the payment instructions again.", time: "2:15 PM" },
  { id: "13", sender: "buyer", username: "buyer123", content: "I'm opening a dispute. This is ridiculous.", time: "2:16 PM" },

  // Admin joins
  { id: "14", sender: "admin", username: "Admin", content: "I've been assigned to review this dispute. Give me a moment to look through the evidence.", time: "2:25 PM", isAdmin: true },
  { id: "15", sender: "buyer", username: "buyer123", content: "Finally. I sent the payment to the details tvs gave me and now they're saying it's wrong.", time: "2:26 PM" },
  { id: "16", sender: "seller", username: "tvs", content: "Admin, my payment instructions clearly say account ending 4521. The buyer mistyped it.", time: "2:27 PM" },
  { id: "17", sender: "admin", username: "Admin", content: "I can see the payment instructions in the listing. The account number listed ends in 4521.", time: "2:29 PM", isAdmin: true },
  { id: "18", sender: "admin", username: "Admin", content: "buyer123, can you share a screenshot of the account number you sent to?", time: "2:29 PM", isAdmin: true },
  { id: "19", sender: "buyer", username: "buyer123", content: "[Screenshot: transfer_details.png]", time: "2:31 PM", isImage: true },
  { id: "20", sender: "admin", username: "Admin", content: "I can see the transfer was sent to account ending 4512. The listing says 4521. Unfortunately this appears to be a typing error on the buyer's side.", time: "2:33 PM", isAdmin: true },
  { id: "21", sender: "buyer", username: "buyer123", content: "Can you help me get the money back at least?", time: "2:34 PM" },
  { id: "22", sender: "admin", username: "Admin", content: "The platform can only control the escrowed crypto, not bank transfers. You'll need to contact your bank to reverse the transfer to the wrong account.", time: "2:35 PM", isAdmin: true },
  { id: "23", sender: "admin", username: "Admin", content: "Since the seller never received the payment, I will be refunding the escrowed SOL back to tvs. buyer123, I recommend contacting your bank immediately about the misdirected transfer.", time: "2:36 PM", isAdmin: true },
  { id: "24", sender: "seller", username: "tvs", content: "Thank you admin. Sorry about this buyer123, hope the bank can help.", time: "2:37 PM" },
  { id: "25", sender: "buyer", username: "buyer123", content: "This sucks but I understand. Thanks for looking into it.", time: "2:38 PM" },
  { id: "26", sender: "admin", username: "Admin", content: "Escrow refunded to tvs. Dispute resolved. Both of you stay safe.", time: "2:40 PM", isAdmin: true },
];

function ChatView({ perspective, messages }: { perspective: "admin" | "buyer" | "seller"; messages: typeof MOCK_MESSAGES }) {
  const [input, setInput] = useState("");

  const myRole = perspective;
  const label = perspective === "admin" ? "Admin View" : perspective === "buyer" ? "Buyer View (buyer123)" : "Seller View (tvs)";
  const headerColor = perspective === "admin" ? "#7B5EFF" : perspective === "buyer" ? "#16C784" : "#FF9F0A";

  return (
    <div style={{ flex: 1, minWidth: 280, maxWidth: 400, display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", background: "var(--surface-card)" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", background: headerColor, color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
        {perspective === "admin" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        )}
        {label}
      </div>

      {/* Dispute banner */}
      <div style={{ padding: "8px 16px", background: "rgba(255,69,58,0.06)", borderBottom: "1px solid rgba(255,69,58,0.1)", fontSize: 12, fontWeight: 600, color: "#FF453A", display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
        Dispute — Admin has joined the chat
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6, minHeight: 350 }}>
        {messages.map((msg) => {
          const isMe = msg.sender === myRole;
          const isAdmin = msg.sender === "admin";
          const isBuyerMsg = msg.sender === "buyer";
          const isSellerMsg = msg.sender === "seller";
          const isAdminView = perspective === "admin";

          // Admin view: buyer on left, seller on right, admin centered
          // User view: own messages right, others left
          const alignRight = isAdminView
            ? isAdmin
            : isMe;
          const alignLeft = isAdminView
            ? !isAdmin
            : !isMe;

          // Colors for admin view
          const buyerColor = "#16C784";
          const sellerColor = "#7B5EFF";

          // Username color
          const usernameColor = isAdmin
            ? "#D4880F"
            : isAdminView
              ? isBuyerMsg ? buyerColor : isSellerMsg ? sellerColor : "var(--text-tertiary)"
              : "var(--text-tertiary)";

          // Bubble background
          const bubbleBg = isAdmin
            ? "linear-gradient(135deg, #FFF8E1, #FFF3CD)"
            : isAdminView
              ? isBuyerMsg
                ? "rgba(22, 199, 132, 0.08)"
                : isSellerMsg
                  ? "rgba(123, 94, 255, 0.08)"
                  : "var(--bg-secondary)"
              : isMe
                ? "var(--aurora-start)"
                : "var(--bg-secondary)";

          // Bubble border for admin view
          const bubbleBorder = isAdmin
            ? "1px solid #FFD700"
            : isAdminView
              ? isBuyerMsg
                ? "1px solid rgba(22, 199, 132, 0.25)"
                : isSellerMsg
                  ? "1px solid rgba(123, 94, 255, 0.25)"
                  : "none"
              : "none";

          // Text color
          const textColor = isAdmin
            ? "#8B6914"
            : isMe && !isAdminView
              ? "#fff"
              : "var(--text-primary)";

          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isAdmin && isAdminView ? "center" : alignRight ? "flex-end" : "flex-start",
                maxWidth: isAdmin && isAdminView ? "90%" : "85%",
                alignSelf: isAdmin && isAdminView ? "center" : alignRight ? "flex-end" : "flex-start",
              }}
            >
              {/* Username + badge + role tag */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, padding: "0 4px" }}>
                {isAdmin && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "1px 6px", borderRadius: 4,
                    background: "linear-gradient(135deg, #FFD700, #FFA500)",
                    color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                  }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    ADMIN
                  </span>
                )}
                {isAdminView && isBuyerMsg && (
                  <span style={{
                    padding: "1px 6px", borderRadius: 4,
                    background: "rgba(22, 199, 132, 0.15)", color: buyerColor,
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                  }}>BUYER</span>
                )}
                {isAdminView && isSellerMsg && (
                  <span style={{
                    padding: "1px 6px", borderRadius: 4,
                    background: "rgba(123, 94, 255, 0.15)", color: sellerColor,
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                  }}>SELLER</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: usernameColor }}>
                  {msg.username}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{msg.time}</span>
              </div>

              {/* Bubble */}
              <div style={{
                padding: msg.isImage ? "8px" : "8px 14px",
                borderRadius: isAdmin && isAdminView
                  ? "14px"
                  : alignRight ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: bubbleBg,
                color: textColor,
                fontSize: 14,
                lineHeight: 1.4,
                border: bubbleBorder,
                boxShadow: isAdmin ? "0 1px 4px rgba(255,215,0,0.15)" : "none",
              }}>
                {msg.isImage ? (
                  <div style={{ width: 180, height: 100, background: "var(--bg-tertiary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
                    [Screenshot]
                  </div>
                ) : msg.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div style={{ padding: 10, borderTop: "1px solid var(--divider)", display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder={perspective === "admin" ? "Message both parties..." : "Type a message..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 20,
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            fontSize: 14, outline: "none",
          }}
        />
        <button style={{
          width: 40, height: 40, borderRadius: 20,
          background: perspective === "admin" ? "linear-gradient(135deg, #FFD700, #FFA500)" : "var(--aurora-start)",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ChatDemoPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Dispute Chat — Design Preview</h1>
      <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 24 }}>
        All three perspectives side by side. Admin messages appear in gold with a shield badge.
      </p>

      <div style={{ display: "flex", gap: 16, overflowX: "auto" }}>
        <ChatView perspective="buyer" messages={MOCK_MESSAGES} />
        <ChatView perspective="seller" messages={MOCK_MESSAGES} />
        <ChatView perspective="admin" messages={MOCK_MESSAGES} />
      </div>

      <div style={{ marginTop: 24, padding: 16, background: "var(--bg-secondary)", borderRadius: 12, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <strong>Design notes:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>Admin messages have a <strong>gold gradient background</strong> with a <strong>shield badge</strong> — unmistakable</li>
          <li>Each user sees their own messages on the right, others on the left (standard chat UX)</li>
          <li>Admin sees the same chat as both parties — one shared thread</li>
          <li>"Dispute — Admin has joined the chat" banner appears when admin enters</li>
          <li>Admin send button is gold, users have purple</li>
        </ul>
      </div>
    </div>
  );
}
