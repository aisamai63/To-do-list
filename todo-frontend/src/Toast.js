import React from "react";

// Minimal toast container. App manages adding/removing toasts and auto-dismiss.
export default function ToastContainer({ toasts, removeToast }) {
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            minWidth: 220,
            padding: "10px 12px",
            borderRadius: 10,
            background:
              t.type === "error"
                ? "#fee2e2"
                : t.type === "success"
                ? "#dcfce7"
                : "#eef2ff",
            color: "#0f172a",
            boxShadow: "0 8px 24px rgba(2,6,23,0.12)",
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ flex: 1 }}>{t.message}</div>
          <button
            onClick={() => removeToast(t.id)}
            aria-label="dismiss"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
