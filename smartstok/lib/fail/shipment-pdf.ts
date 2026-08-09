/** Client-side PDF for fail shipment preview */

function shipmentDateStamp(createdAt: string) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}_${hh}-${mm}`;
}

export async function downloadFailShipmentPdf(shipment: {
  id: string;
  createdAt: string;
  lines: Array<{ referenceCode: string; productName: string; quantity: number }>;
  totalQuantity: number;
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Fail Urun Gonderim Listesi", 14, 18);
  doc.setFontSize(10);
  doc.text(`Talep No: ${shipment.id}`, 14, 26);
  doc.text(
    `Tarih: ${new Date(shipment.createdAt).toLocaleString("tr-TR")}`,
    14,
    32,
  );
  doc.text(`Toplam adet: ${shipment.totalQuantity}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [["Referans", "Urun", "Adet"]],
    body: shipment.lines.map((l) => [
      l.referenceCode,
      l.productName,
      String(l.quantity),
    ]),
  });

  doc.save(`fail-gonderim-${shipmentDateStamp(shipment.createdAt)}.pdf`);
}

export function openFailShipmentMailto(shipment: {
  id: string;
  createdAt: string;
  lines: Array<{ referenceCode: string; productName: string; quantity: number }>;
  totalQuantity: number;
}) {
  const stamp = shipmentDateStamp(shipment.createdAt);
  const subject = encodeURIComponent(
    `Fail urun gonderim listesi — ${stamp}`,
  );
  const bodyLines = [
    "Merhaba,",
    "",
    "Ek'te fail urun gonderim listesi PDF'ini bulabilirsiniz (indirdiginiz PDF'i ekleyiniz).",
    "",
    `Dosya: fail-gonderim-${stamp}.pdf`,
    `Toplam adet: ${shipment.totalQuantity}`,
    "",
    ...shipment.lines.map(
      (l) => `- ${l.referenceCode} ${l.productName}: ${l.quantity} adet`,
    ),
    "",
    "SmartStok",
  ];
  const body = encodeURIComponent(bodyLines.join("\n"));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
