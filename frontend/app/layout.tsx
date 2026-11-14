import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LunaWindow | Lunar Landing Site Navigator", template: "%s · LunaWindow" },
  description: "Compare sunlight and direct-to-Earth visibility at the lunar south pole using NASA data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
