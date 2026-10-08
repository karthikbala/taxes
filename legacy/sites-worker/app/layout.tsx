import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeneral Property Data Explorer",
  description: "Live county lookup and traceable property evidence.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
