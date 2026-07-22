import type { Metadata } from "next";
import { Anek_Kannada, Noto_Sans_Kannada, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

// Display — Anek Kannada carries both Kannada and Latin, so the bilingual
// masthead and section headers share one voice.
const anekKannada = Anek_Kannada({
  variable: "--font-display",
  subsets: ["kannada", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Body — Noto Sans Kannada: neutral, institutional, and bilingual (Kannada +
// Latin) in one face. Government-form legibility without feeling generic.
const notoKannada = Noto_Sans_Kannada({
  variable: "--font-body",
  subsets: ["kannada", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Data — case numbers, SQL, timestamps, seals.
const plexMono = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${anekKannada.variable} ${notoKannada.variable} ${plexMono.variable} h-full`}
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
