import sharp from "sharp";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "public/icons");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#09090f"/>
  <rect x="4" y="4" width="120" height="120" rx="20" fill="#0f0f17" stroke="#1a1a2e" stroke-width="2"/>
  <path d="M64 28 L84 56 L76 56 L76 76 L52 76 L52 56 L44 56 Z" fill="#5664f2"/>
  <rect x="48" y="82" width="32" height="8" rx="4" fill="#5664f2" opacity="0.6"/>
  <rect x="54" y="94" width="20" height="6" rx="3" fill="#5664f2" opacity="0.3"/>
</svg>`;

const sizes = [16, 48, 128];

for (const size of sizes) {
  const buf = Buffer.from(svg);
  const pngBuf = await sharp(buf).resize(size, size).png().toBuffer();
  const outPath = resolve(outDir, `icon${size}.png`);
  writeFileSync(outPath, pngBuf);
  console.log(`Generated ${outPath} (${pngBuf.length} bytes)`);
}

console.log("\nIcons generated successfully in public/icons/");
