/**
 * Next.js standalone çıktısını cPanel Node.js App için tamamlar.
 *
 * next build sonrası:
 *   .next/standalone/public          ← public/
 *   .next/standalone/.next/static    ← .next/static/
 *
 * Çalıştırma: npm run build:cpanel
 * Sunucuda:   node .next/standalone/server.js  (veya cPanel Application Startup File)
 */

const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[package-cpanel] Atlandı (yok): ${src}`);
    return false;
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[package-cpanel] Kopyalandı: ${src} → ${dest}`);
  return true;
}

const root = __dirname;
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.error(
    "[package-cpanel] .next/standalone bulunamadı. Önce `next build` (output: 'standalone') çalıştırın.",
  );
  process.exit(1);
}

copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
);

console.log("[package-cpanel] Hazır. Deploy paketi: .next/standalone/");
