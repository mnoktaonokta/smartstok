import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AdminSettingsBackNav({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
      >
        <ArrowLeft className="size-4" />
        Admin paneline dön
      </Link>
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Firma ayarları
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm text-zinc-400">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
