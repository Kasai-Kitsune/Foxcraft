import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Foxcraft — Alpha 0.1.0",
  description:
    "A fan-made early-alpha-style voxel sandbox starring a fox. Procedural gritty textures, heavy fog, blocky clouds. Not affiliated with Mojang.",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-black text-white overflow-hidden">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
