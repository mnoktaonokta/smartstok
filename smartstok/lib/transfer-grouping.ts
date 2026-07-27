export type TransferLogFlat = {
  id: string;
  createdAt: string; // ISO
  fromLocationId: string;
  toLocationId: string;
  fromName: string;
  toName: string;
  lotNumber: string;
  productId: string;
  referenceCode: string;
  productName: string;
  requestedByName: string | null;
  executedByName: string;
  executedById?: string;
  requestedById?: string | null;
};

export type GroupedTransferLog = {
  key: string;
  createdAt: string;
  fromName: string;
  toName: string;
  fromLocationId: string;
  toLocationId: string;
  lotNumber: string;
  referenceCode: string;
  productName: string;
  requestedByName: string | null;
  executedByName: string;
  quantity: number;
};

/** Aynı saniye + ürün + lot + kaynak/hedef + işleyen/talep eden → tek satır */
export function groupTransferLogs(
  logs: TransferLogFlat[],
): GroupedTransferLog[] {
  const map = new Map<string, GroupedTransferLog>();

  for (const log of logs) {
    const secondKey = log.createdAt.slice(0, 19); // YYYY-MM-DDTHH:mm:ss
    const key = [
      secondKey,
      log.fromLocationId,
      log.toLocationId,
      log.productId,
      log.lotNumber,
      log.executedById ?? log.executedByName,
      log.requestedById ?? log.requestedByName ?? "",
    ].join("|");

    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      map.set(key, {
        key,
        createdAt: log.createdAt,
        fromName: log.fromName,
        toName: log.toName,
        fromLocationId: log.fromLocationId,
        toLocationId: log.toLocationId,
        lotNumber: log.lotNumber,
        referenceCode: log.referenceCode,
        productName: log.productName,
        requestedByName: log.requestedByName,
        executedByName: log.executedByName,
        quantity: 1,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
