"use client";

export function DespatchPrintView({
  despatchNumber,
  uuid,
  issueDate,
  companyName,
  companyVkn,
  companyAddress,
  customerName,
  customerVkn,
  customerAddress,
  note,
  lines,
}: {
  despatchNumber: string;
  uuid: string;
  issueDate: string;
  companyName: string;
  companyVkn: string;
  companyAddress: string;
  customerName: string;
  customerVkn: string;
  customerAddress: string;
  note?: string | null;
  lines: Array<{ productName: string; lotNumber: string; quantity: number }>;
}) {
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const dateLabel = new Date(issueDate).toLocaleString("tr-TR");

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 print:bg-white">
      <div className="mx-auto max-w-[210mm] p-6 print:p-0">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            Yazdır / PDF kaydet
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
          >
            Geri
          </button>
        </div>

        <article className="rounded-lg bg-white p-8 shadow print:shadow-none">
          <h1 className="text-2xl font-semibold">e-İrsaliye</h1>
          <p className="mt-1 text-sm text-zinc-500">SEVK — TEMELİRSALİYE</p>

          <dl className="mt-6 grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 font-medium">İrsaliye No</dt>
              <dd className="font-mono">{despatchNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-medium">Tarih</dt>
              <dd>{dateLabel}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-medium">ETTN</dt>
              <dd className="font-mono text-xs">{uuid}</dd>
            </div>
          </dl>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <section className="rounded border border-zinc-200 p-3 text-sm">
              <h2 className="font-semibold">Gönderici</h2>
              <p className="mt-1">{companyName}</p>
              <p className="font-mono text-xs">VKN/TCKN: {companyVkn || "—"}</p>
              <p className="mt-1 text-zinc-600">{companyAddress || "—"}</p>
            </section>
            <section className="rounded border border-zinc-200 p-3 text-sm">
              <h2 className="font-semibold">Alıcı</h2>
              <p className="mt-1">{customerName}</p>
              <p className="font-mono text-xs">VKN/TCKN: {customerVkn}</p>
              <p className="mt-1 text-zinc-600">{customerAddress || "—"}</p>
            </section>
          </div>

          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-100">
                <th className="border border-zinc-300 px-2 py-1.5 text-left">
                  Sıra
                </th>
                <th className="border border-zinc-300 px-2 py-1.5 text-left">
                  Mal / Hizmet
                </th>
                <th className="border border-zinc-300 px-2 py-1.5 text-left">
                  Lot
                </th>
                <th className="border border-zinc-300 px-2 py-1.5 text-right">
                  Miktar
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={`${line.productName}-${line.lotNumber}`}>
                  <td className="border border-zinc-300 px-2 py-1.5">{i + 1}</td>
                  <td className="border border-zinc-300 px-2 py-1.5">
                    {line.productName}
                  </td>
                  <td className="border border-zinc-300 px-2 py-1.5 font-mono text-xs">
                    {line.lotNumber}
                  </td>
                  <td className="border border-zinc-300 px-2 py-1.5 text-right font-mono">
                    {line.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 text-sm">
            Toplam miktar: <strong>{totalQty} adet</strong>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Bu belgede birim fiyat ve tutar yer almaz.
          </p>
          {note ? (
            <p className="mt-3 text-sm">
              Not: {note}
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
