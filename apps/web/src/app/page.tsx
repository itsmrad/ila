import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 40, margin: 0 }}>ILA</h1>
      <p style={{ color: "#98a2b3", maxWidth: 460, textAlign: "center" }}>
        AI-powered browser automation & productivity assistant. This is the web
        frontend scaffold — the real product surface lands here.
      </p>
      <Link
        href="/sign-in"
        style={{
          padding: "12px 22px",
          background: "#6d5efc",
          color: "#fff",
          borderRadius: 10,
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        Go to sign in
      </Link>
    </main>
  );
}
