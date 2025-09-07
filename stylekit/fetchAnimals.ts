/**
 * Fetch B&W animal photos from Unsplash and append them to cdn/tqf-photos.json
 *
 * Usage:
 *   UNSPLASH_ACCESS_KEY=xxx npx tsx stylekit/fetchAnimals.ts --want=60 --pages=2
 *   (or put the key in .env)
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import dotenv from "dotenv";
dotenv.config();

// node-fetch v2 default export
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import fetch from "node-fetch";

const WANT  = Number((process.argv.find(a => a.startsWith("--want="))  || "").split("=")[1] || 40);
const PAGES = Number((process.argv.find(a => a.startsWith("--pages=")) || "").split("=")[1] || 2);

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) {
  console.error("❌ Missing UNSPLASH_ACCESS_KEY (set in .env or export it).");
  process.exit(1);
}

// --- Strong B&W + minimal queries (balanced spread) ---
const QUERIES: Record<string, string[]> = {
  elephant: [
    "elephant close-up face black and white minimal",
    "elephant portrait monochrome minimal background",
    "elephant eye texture black and white minimal"
  ],
  whale: [
    "whale eye underwater black and white minimal",
    "humpback surfacing monochrome minimal background",
    "whale portrait black and white minimal"
  ],
  horse: [
    "horse portrait eye close-up black and white minimal",
    "horse nostrils mane monochrome minimal",
    "horse portrait black and white studio minimal"
  ],
  wolf: [
    "wolf half face portrait black and white minimal",
    "wolf gaze monochrome minimal",
    "wolf close-up eye black and white minimal"
  ],
  owl: [
    "owl face close-up black and white minimal",
    "owl eye portrait monochrome minimal",
    "owl portrait black and white minimal background"
  ],
  dog: [
    "dog portrait close-up eye black and white minimal",
    "dog half face monochrome minimal background",
    "dog muzzle texture black and white minimal"
  ],
  cat: [
    "cat portrait close-up eye black and white minimal",
    "cat whiskers monochrome minimal background",
    "cat half face black and white minimal"
  ],
  zebra: [
    "zebra stripes close-up black and white minimal",
    "zebra portrait half face monochrome minimal",
    "zebra head texture black and white minimal"
  ],
  antelope: [
    "antelope portrait close-up black and white minimal",
    "gazelle portrait monochrome minimal background",
    "antelope horns texture black and white minimal"
  ],
  lion: [
    "lion portrait close-up eye black and white minimal",
    "lion half face monochrome minimal",
    "lion mane texture black and white minimal background"
  ],
  bear: [
    "bear portrait close-up eye black and white minimal",
    "bear half face monochrome minimal background",
    "bear muzzle black and white minimal"
  ],
  eagle: [
    "eagle portrait close-up black and white minimal",
    "eagle eye monochrome minimal",
    "eagle headshot black and white minimal background"
  ],
  buffalo: [
    "buffalo portrait close-up black and white minimal",
    "buffalo horns monochrome minimal",
    "buffalo face black and white minimal background"
  ],
  crocodile: [
    "crocodile eye close-up black and white minimal",
    "crocodile portrait monochrome minimal background",
    "crocodile face black and white minimal"
  ],
  gorilla: [
    "gorilla portrait close-up eye black and white minimal",
    "gorilla face monochrome minimal background",
    "gorilla half face black and white minimal"
  ],
  rhino: [
    "rhinoceros portrait close-up black and white minimal",
    "rhino horn monochrome minimal",
    "rhinoceros face black and white minimal background"
  ],
  tiger: [
    "tiger portrait close-up eye black and white minimal",
    "tiger half face monochrome minimal",
    "tiger stripes texture black and white minimal"
  ]
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function searchUnsplash(q: string, page = 1) {
  const url =
    `https://api.unsplash.com/search/photos` +
    `?query=${encodeURIComponent(q)}` +
    `&page=${page}&per_page=30` +
    `&orientation=landscape&content_filter=high` +
    `&color=black_and_white`; // ← force B&W on Unsplash side
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${KEY}` } });
  if (!res.ok) throw new Error(`Unsplash ${res.status}: ${await res.text()}`);
  return res.json();
}

// basic 16:9-ish guard
function isWideEnough(w?: number, h?: number) {
  if (!w || !h) return false;
  const r = w / h;
  return r >= 1.6; // allow slightly narrower than 16:9 (1.777)
}

// strict saturation check (normalize and compute mean saturation)
async function isNearlyBW(imgUrl: string, w = 900, satThreshold = 0.10): Promise<boolean> {
  const u = imgUrl.includes("?") ? `${imgUrl}&w=${w}&auto=format&q=80` : `${imgUrl}?w=${w}&auto=format&q=80`;
  const res = await fetch(u);
  if (!res.ok) return false;

  const buf = Buffer.from(await res.arrayBuffer());
  const img = sharp(buf).removeAlpha().toColourspace("rgb");
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const pixels = info.width * info.height;
  let satSum = 0;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let s = 0;
    if (max !== min) s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    satSum += s;
  }
  const satMean = satSum / pixels; // 0 = gray, 1 = vivid
  return satMean < satThreshold;
}

function toEntry(subject: string, p: any) {
  return {
    url: p.urls.raw,
    photographer: p.user?.name || "Unknown",
    photographerUrl: `${p.user?.links?.html}?utm_source=tqf&utm_medium=referral`,
    downloadLocation: p.links?.download_location,
    category: "animal",
    subject
  };
}

async function main() {
  fs.mkdirSync("output", { recursive: true });

  const cdnPath = path.join("cdn", "tqf-photos.json");
  const manifest: any[] = fs.existsSync(cdnPath) ? JSON.parse(fs.readFileSync(cdnPath, "utf-8")) : [];
  const existingKeys = new Set((manifest || []).map(e => e.downloadLocation || e.url));

  const subjects = Object.keys(QUERIES);
  const capPerSubject = Math.max(1, Math.ceil(WANT / subjects.length));

  const candidates: { subject: string; p: any }[] = [];
  const seen = new Set<string>();

  for (const [subject, queries] of Object.entries(QUERIES)) {
    for (const q of queries) {
      for (let page = 1; page <= PAGES; page++) {
        const data = await searchUnsplash(q, page);
        for (const p of (data.results || [])) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);

          if (!isWideEnough(p.width, p.height)) continue;
          if (!p.links?.download_location) continue;

          // strict B&W gate
          const bw = await isNearlyBW(p.urls.raw).catch(() => false);
          if (!bw) continue;

          candidates.push({ subject, p });
        }
        await sleep(200);
      }
    }
  }

  // Spread by subject
  const counts: Record<string, number> = {};
  const picks: { subject: string; p: any }[] = [];
  for (const c of candidates) {
    if (picks.length >= WANT) break;
    const have = counts[c.subject] || 0;
    if (have >= capPerSubject) continue;

    const key = c.p.links.download_location;
    if (existingKeys.has(key)) continue;

    counts[c.subject] = have + 1;
    picks.push(c);
    existingKeys.add(key);
  }

  // QA list
  const qa = picks.map(({ subject, p }) => ({
    subject,
    id: p.id,
    width: p.width,
    height: p.height,
    url: p.urls.raw,
    photographer: p.user?.name,
    html: p.links?.html,
    downloadLocation: p.links?.download_location
  }));
  fs.writeFileSync(path.join("output", "picks.animals.json"), JSON.stringify(qa, null, 2));

  // Append to manifest
  const toAdd = picks.map(({ subject, p }) => toEntry(subject, p));
  const merged = [...manifest, ...toAdd];
  fs.writeFileSync(cdnPath, JSON.stringify(merged, null, 2));

  console.log(`Candidates: ${candidates.length}`);
  console.log(`Picked: ${toAdd.length}`);
  console.log(`Manifest size: ${merged.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });