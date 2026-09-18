import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Schedule",
  description: "Planificación inteligente de turnos para equipos en varios locales.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
