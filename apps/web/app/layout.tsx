import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "SnapKYC Video",
  description: "Video KYC proof of concept with maker-checker review",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <header className="site-header">
          <Link href="/" className="brand">
            SnapKYC <span>Video</span>
          </Link>
          <nav>
            <Link href="/customer">Customer</Link>
            <Link href="/login">Staff</Link>
            <Link href="/verify">Verify token</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
