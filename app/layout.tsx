import type { Metadata } from "next";
import { Geist, Manrope, JetBrains_Mono } from "next/font/google";
import { ToastViewport } from "@/components/shared/Toast";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LeadFlow",
  description: "Lead scraping, outreach, follow-up, proposals and onboarding in one console.",
  // A private operator console - nothing here should be indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <div aria-hidden="true" className="page-grain" />
        {/* overflow-x-clip: decorative glows (.ambient-wash) bleed past the
            right edge by design; clip them at the screen edge instead of
            letting them widen the page. Clip, not hidden, so sticky headers
            keep working. */}
        <div className="flex min-h-dvh flex-col overflow-x-clip">{children}</div>
        <ToastViewport />
      </body>
    </html>
  );
}
