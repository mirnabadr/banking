import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google"; // not used
import { Inter, IBM_Plex_Serif } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  
});

const ibmPlexSerif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "TechPay Banking System",
  description: "TechPay is modern Banking System for your business",
  icons: {
    icon: "/icons/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${ibmPlexSerif.variable} `}
         
      >
        {children}
      </body>
    </html>
  );
}
