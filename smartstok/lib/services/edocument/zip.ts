import { createHash } from "crypto";
import { inflateRawSync } from "zlib";
import JSZip from "jszip";

/** CRC-32 (ZIP / PNG) */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Tek dosyalı ZIP (STORE). e-Logo SendDocument zip ister.
 */
export function zipStoreSingleFile(fileName: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(fileName, "utf8");
  const crc = crc32(content);
  const size = content.length;

  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  nameBuf.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + content.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, content, central, end]);
}

export function md5HexUpper(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex").toUpperCase();
}

/** UBL XML → zip + MD5 (e-Logo SendDocument). */
export function ublToElogoZip(uuid: string, ublXml: string): {
  zip: Buffer;
  fileName: string;
  hash: string;
  base64: string;
} {
  const innerName = `${uuid}.xml`;
  const zipName = `${uuid}.zip`;
  const zip = zipStoreSingleFile(innerName, Buffer.from(ublXml, "utf8"));
  const hash = md5HexUpper(zip);
  return {
    zip,
    fileName: zipName,
    hash,
    base64: zip.toString("base64"),
  };
}

export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 4).toString("utf8") === "%PDF";
}

function isZipBuffer(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/**
 * e-Logo GetDocumentData binary'si (ham PDF veya zip) → PDF buffer.
 */
export async function elogoBinaryToPdf(raw: Buffer): Promise<Buffer | null> {
  if (isPdfBuffer(raw)) return raw;
  if (!isZipBuffer(raw)) {
    // Bazen base64 içinde yine base64 PDF olabilir
    return null;
  }

  try {
    const zip = await JSZip.loadAsync(raw);
    const names = Object.keys(zip.files);
    const pdfName =
      names.find((n) => /\.pdf$/i.test(n) && !zip.files[n]!.dir) ??
      names.find((n) => !zip.files[n]!.dir);

    for (const name of [
      ...(pdfName ? [pdfName] : []),
      ...names.filter((n) => !zip.files[n]!.dir),
    ]) {
      const data = Buffer.from(await zip.files[name]!.async("uint8array"));
      if (isPdfBuffer(data)) return data;
    }
  } catch {
    // JSZip başarısızsa basit DEFLATE dene
    try {
      if (raw.length > 30 && raw.readUInt32LE(0) === 0x04034b50) {
        const method = raw.readUInt16LE(8);
        const compSize = raw.readUInt32LE(18);
        const nameLen = raw.readUInt16LE(26);
        const extraLen = raw.readUInt16LE(28);
        const start = 30 + nameLen + extraLen;
        const compressed = raw.subarray(start, start + compSize);
        const data =
          method === 0
            ? Buffer.from(compressed)
            : inflateRawSync(compressed);
        if (isPdfBuffer(data)) return data;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

/** Base64 (PDF veya zip) → PDF base64. */
export async function normalizeElogoPdfBase64(
  b64: string,
): Promise<string | null> {
  try {
    const raw = Buffer.from(b64.replace(/\s+/g, ""), "base64");
    const pdf = await elogoBinaryToPdf(raw);
    return pdf ? pdf.toString("base64") : null;
  } catch {
    return null;
  }
}
