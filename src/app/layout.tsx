import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Echoes of the Static - Ecos de la Estática",
  description: "Un juego de terror auditivo en primera persona. Estás ciego. El sonido es tu único guía... y tu mayor peligro.",
  keywords: ["horror game", "echolocation", "audio horror", "blind game", "indie game"],
  authors: [{ name: "Echoes of the Static" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-hidden`}
        style={{ margin: 0, padding: 0, background: '#000' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
