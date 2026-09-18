import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const headingFont = localFont({
  src: [
    { path: "./fonts/pt-sans-caption-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/pt-sans-caption-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = localFont({
  src: [
    { path: "./fonts/lunasima-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/lunasima-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Admitly — поступление в университеты США",
  description: "Подбор университетов США, сравнение и план поступления по вашему профилю.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" suppressHydrationWarning><body className={`${headingFont.variable} ${bodyFont.variable}`}>{children}</body></html>;
}
