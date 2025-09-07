/**
 * Preview-only: fetch black & white animal photos from Unsplash.
 * Writes picks to output/picks.animals.json and DOES NOT touch cdn/tqf-photos.json.
 *
 * Usage:
 *   UNSPLASH_ACCESS_KEY=xxx npx tsx stylekit/fetchAnimals.ts --want=60 --pages=2
 *   (optional) --out=output/picks.animals.json
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();
// node-fetch v2 default export
// @ts-ignore
import fetch from "node-fetch";

const getArg = (name: string, def?: string) =>
  (process.argv.find(a => a.startsWith(`--${name}=`)) || "").split("=")[1] || def;

const WANT  = Number(getArg("want", "40"));
const PAGES = Number(getArg("pages", "2"));
const OUT   = getArg("out", "output/picks.animals.json")!;

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) {
  console.error("❌ Missing UNSPLASH_ACCESS_KEY (put it in .env or export it).");
  process.exit(1);
}

// Subjects (feel free to trim/expand later)
const SUBJECTS = [
  "elephant","lion","zebra","wolf","owl",
  "dog","cat","antelope","horse","bear",
  "eagle","buffalo","crocodile","gorilla","rhino","tiger"
];

function sleep(ms:number){ return new Promise(r => setTimeout(r, ms)); }

async function searchUnsplash(q: string, page = 1) {
  const url =
    `https://api.unsplash.com/search/photos` +
    `?query=${encodeURIComponent(q + " black and white minimal portrait")}` +
    `&page=${page}&per_page=30` +
    `&orientation=landscape&content_filter=high` +
    `&color=black_and_white`; // bias B&W
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${KEY}` } });
  if (!res.ok) throw new Error(`Unsplash ${res.status}: ${await res.text()}`);
  return res.json();
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

  const picks: any[] = [];
  const seen = new Set<string>();

  for (const subject of SUBJECTS) {
    for (let page = 1; page <= PAGES; page++) {
      const data = await searchUnsplash(subject, page);
      for (const p of data.results || []) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        if (!p.links?.download_location) continue;
        // Keep wide-ish (16:9 ~ 1.777; accept a bit narrower)
        const w = p.width, h = p.height;
        if (!w || !h || w / h < 1.6) continue;

        picks.push(toEntry(subject, p));
        if (picks.length >= WANT) break;
      }
      if (picks.length >= WANT) break;
      await sleep(200);
    }
    if (picks.length >= WANT) break;
  }

  fs.writeFileSync(OUT, JSON.stringify(picks, null, 2));
  console.log(`✅ Saved ${picks.length} animal picks to ${OUT}`);
  console.log(`👉 Review them first. The main manifest was NOT modified.`);
}

main().catch(err => { console.error(err); process.exit(1); });