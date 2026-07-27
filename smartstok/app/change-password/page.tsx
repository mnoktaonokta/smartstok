import { ChangePasswordForm } from "@/components/auth/change-password-form";

export default function ChangePasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 auth-grid" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_55%)]" />

      <div className="auth-panel relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Şifre Değiştir
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            İlk girişte güvenlik nedeniyle şifrenizi güncellemeniz zorunludur.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-6 shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-md sm:p-8">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
