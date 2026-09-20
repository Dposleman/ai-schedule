import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { LanguageProvider } from "@/app/language-context";

export const metadata: Metadata = {
  title: "UnderStack Shift",
  description: "Smart shift planning for multi-location teams.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider persistToAccount>{children}</LanguageProvider>
      </body>
    </html>
  );
}
