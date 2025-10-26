// app/src/screens/Menu.jsx
import React from "react";

const LIMITS = {
  trial: Infinity, // FREE TRIAL 3 days with unlimited messages
  Pro: Infinity, // PRO plan for 30 days with no sending limits
};

export default function Menu({ status, onSelectTopic }) {
  const used = status.requestsWeek;
  const limit = LIMITS[status.package] ?? 0;
  const remaining = limit === Infinity ? "∞" : Math.max(limit - used, 0);
  const usedPercent =
    limit === Infinity ? 0 : Math.min(Math.round((used / limit) * 100), 100);

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 900,
        margin: "0 auto",
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "#0f111a",
        color: "#fff",
        fontFamily:
          "-apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen",
      }}
    >
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
          Services
        </h1>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: "1 1 250px",
              background: "#1f2237",
              padding: 16,
              borderRadius: 12,
              position: "relative",
              minWidth: 220,
              boxShadow: "0 16px 40px -10px rgba(108,99,255,0.3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, textTransform: "uppercase", opacity: 0.75 }}>
                  Package
                </div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {status.package}
                </div>
              </div>
              <div
                style={{
                  background: "#6c63ff",
                  padding: "6px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  alignSelf: "center",
                }}
              >
                {status.package === "Elite" ? "Unlimited" : `${used} / ${limit}`}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  height: 8,
                  background: "#242850",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width:
                      limit === Infinity
                        ? "100%"
                        : `${Math.min((used / (limit || 1)) * 100, 100)}%`,
                    height: "100%",
                    background:
                      limit === Infinity
                        ? "#00d084"
                        : usedPercent >= 100
                        ? "#ff6b6b"
                        : "#6c63ff",
                    transition: "width .3s ease",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  opacity: 0.85,
                }}
              >
                <div>
                  {limit === Infinity
                    ? `Used: ${used}`
                    : `Used: ${used} / ${limit}`}
                </div>
                <div>
                  Remaining: {limit === Infinity ? "∞" : Math.max(limit - used, 0)}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              flex: "2 1 400px",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              minWidth: 280,
            }}
          >
            <div
              style={{
                flex: "1 1 180px",
                background: "#1f2237",
                padding: 16,
                borderRadius: 12,
                minWidth: 160,
                boxShadow: "0 16px 40px -10px rgba(108,99,255,0.2)",
              }}
            >
              <div style={{ fontSize: 14, opacity: 0.75 }}>Support</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                <span role="img" aria-label="support">
                  💬
                </span>{" "}
                <span
  onClick={() => {
    const url = "https://t.me/LiveTradeDM";
    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.openLink === "function") {
      tg.openLink(url);
    } else {
      window.open(url, "_blank");
    }
  }}
  style={{
    color: "#fff",
    textDecoration: "underline",
    fontWeight: 600,
    cursor: "pointer",
  }}
>
  @LiveTradeDM
</span>

              </div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
                Need help with payments or access? Message support directly.
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          marginTop: 10,
        }}
      >
        {[
          { key: "trade_setup", label: "📉 Trade Setup Review" },
          { key: "account_health", label: "📊 Account Health Check" },
          { key: "psychology", label: "🧠 Psychology Support" },
          { key: "funded_account", label: "🏆 Funded Account Advice" },
          { key: "margin_call", label: "⚠️ Margin Call Emergency" },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => onSelectTopic(item.key)}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "#1f2255",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 20px 60px -10px rgba(108,99,255,0.2)",
              transition: "transform .15s ease, background .2s ease",
              width: "100%",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.02)";
              e.currentTarget.style.background = "#2a2f7f";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.background = "#1f2255";
            }}
          >
            <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
            <span style={{ fontSize: 18, opacity: 0.9 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
