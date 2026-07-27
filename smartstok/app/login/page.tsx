import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 auth-grid" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(14,165,233,0.12),_transparent_50%)]" />
      <div className="auth-glow pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-600/30 blur-[100px]" />

      <div className="auth-panel relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-xs tracking-[0.35em] text-blue-400 uppercase">
            Operasyon Sistemi
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Smart{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Dental
            </span>
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Stok, saha satış ve depo operasyonlarına güvenli giriş.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-6 shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-md sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-medium text-zinc-100">Giriş Yap</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Hesaplar yalnızca yöneticiler tarafından oluşturulur.
            </p>
          </div>
          <LoginForm />
        </div>

        <p className="mt-6 text-center font-mono text-[11px] tracking-wide text-zinc-600">
          SMARTSTOK · SECURE ACCESS
        </p>
      </div>
    </main>
  );
}
