import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "认词簿",
  description: "安静、专注的词汇辨识工具。",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
