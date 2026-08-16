import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Sora, JetBrains_Mono } from "next/font/google";
import { auth } from "@/auth";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("smartstok-theme")?.value;
  const theme = raw === "light" || raw === "dark" ? raw : "dark";
  const session = await auth();

  return (
    <html
      lang="tr"
      className={`${sora.variable} ${jetbrainsMono.variable} ${theme} h-full`}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        <ThemeProvider initialTheme={theme}>
          <AuthSessionProvider session={session}>{children}</AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
