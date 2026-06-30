import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono, Barlow_Condensed } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Khabri AI — Karnataka Police Crime Intelligence",
  description: "Conversational AI for KSP crime database analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${spaceGrotesk.variable} ${spaceMono.variable} ${barlowCondensed.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Prevent theme flash: read localStorage before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('khabri_theme');if(t!=='dark'&&t!=='light')t='light';document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
