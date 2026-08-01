import { MessageCircle } from "lucide-react";

/**
 * Dashboard kilit ekranı — lisans süresi dolunca layout children yerine gösterilir.
 */
export function LicenseLockScreen({
  whatsappUrl,
}: {
  whatsappUrl: string | null;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_55%)]" />
      <div className="relative z-10 w-full max-w-lg text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-blue-400 uppercase">
          SmartStok
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Lisans Süresi Doldu
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
          Yıllık lisans süreniz sona ermiştir. Sistemi kullanmaya devam etmek
          için lütfen yazılım sağlayıcınız ile iletişime geçin.
        </p>

        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-600 px-6 text-sm font-medium text-white shadow-[0_0_24px_rgba(16,185,129,0.35)] transition-colors hover:bg-emerald-500"
          >
            <MessageCircle className="size-4" />
            WhatsApp ile İletişim
          </a>
        ) : (
          <p className="mt-8 text-sm text-zinc-500">
            Destek için yazılım sağlayıcınıza başvurun.
          </p>
        )}
      </div>
    </div>
  );
}
