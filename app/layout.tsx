import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Оценка взаимодействия",
  description: "MVP для ежемесячной оценки взаимодействия между подразделениями"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
