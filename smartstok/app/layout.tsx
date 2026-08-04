import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart Dental | SmartStok",
  description: "Dental tedarik operasyon, saha satış ve stok takip sistemi",
};

const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('smartstok-theme');
    if (t !== 'light' && t !== 'dark') t = 'dark';
    var r = document.documentElement;
    r.classList.remove('light','dark');
    r.classList.add(t);
    r.style.colorScheme = t;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${sora.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        <ThemeProvider>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
