import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import PersistenceGate from "./PersistenceGate";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  return {
    title: "小步修仙 · 行动中心",
    description: "让每日行动推进长期目标，在持续完成中积累修为。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "小步修仙 · 行动中心",
      description: "让每一个小行动，都推动更大的目标。",
      images: [{ url: `${origin}/og.png`, width: 1680, height: 945, alt: "小步修仙行动中心" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "小步修仙 · 行动中心",
      description: "让每一个小行动，都推动更大的目标。",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body><PersistenceGate>{children}</PersistenceGate></body>
    </html>
  );
}
