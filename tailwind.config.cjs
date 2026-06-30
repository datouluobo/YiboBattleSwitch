module.exports = {
  content: [
    "./app/renderer/index.html",
    "./app/renderer/**/*.ts"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1da1f2",
        "primary-dark": "#0d8fe0",
        background: "#f7f9fb",
        surface: "#ffffff",
        "surface-soft": "#f4f7fa",
        "surface-muted": "#eef3f7",
        stroke: "#dce3ea",
        ink: "#101828",
        "ink-soft": "#667085",
        danger: "#ef4444"
      },
      boxShadow: {
        shell: "0 18px 44px rgba(16, 24, 40, 0.08), 0 2px 8px rgba(16, 24, 40, 0.04)",
        card: "0 4px 14px rgba(15, 23, 42, 0.05)"
      },
      borderRadius: {
        shell: "16px",
        card: "14px",
        button: "12px"
      }
    }
  },
  plugins: []
};
