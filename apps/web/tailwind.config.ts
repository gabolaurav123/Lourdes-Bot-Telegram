import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#151718",
        panel: "#f8faf9",
        line: "#dfe5e1",
        pine: "#0f766e",
        coral: "#be5a38",
        amber: "#b7791f"
      },
      boxShadow: {
        soft: "0 16px 38px rgba(21, 23, 24, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
