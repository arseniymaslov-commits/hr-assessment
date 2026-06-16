import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        muted: "#667085",
        line: "#d9dde5",
        surface: "#f6f7f9",
        brand: "#e30016",
        brandDark: "#9f0010",
        graphite: "#30343b",
        ok: "#14804a",
        warn: "#b54708",
        risk: "#b42318"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(16, 24, 40, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
