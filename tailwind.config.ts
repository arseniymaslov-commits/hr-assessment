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
        ink: "#18202b",
        muted: "#667085",
        line: "#e2e6ee",
        surface: "#f7f8fb",
        brand: "#e30016",
        brandDark: "#9f0010",
        graphite: "#30343b",
        ok: "#14804a",
        warn: "#b54708",
        risk: "#b42318"
      },
      boxShadow: {
        soft: "0 10px 24px rgba(16, 24, 40, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
