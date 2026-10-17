import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ModelFit — Find the Smallest Good-Enough Local Model",
  description:
    "Benchmarking engine and trustworthy evaluation sheet for local LLMs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${schibsted.variable} h-full antialiased`}>
      <body className="min-h-full font-sans bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
