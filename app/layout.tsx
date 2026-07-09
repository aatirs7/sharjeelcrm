import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const code = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "The Desk — TikTok Shop CRM",
  description: "Internal CRM for TikTok Shop account sales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppNav />
          <main className="flex-1 w-full max-w-[76rem] mx-auto px-5 py-8 md:py-10 space-y-8">
            {children}
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
