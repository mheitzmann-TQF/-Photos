import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { buildCentroidFromFolder, embedImage, cosine } from "./styleEmbedding";
import { fetchCandidates } from "./unsplashPicker";
import { ROTATION, Subject, SUBJECT_CAP } from "./subjects";

const ACCESS = process.env.UNSPLASH_ACCESS_KEY || "";
if (!ACCESS) {
  console.warn("⚠️ Tip: set UNSPLASH_ACCESS_KEY in a .env file when you run this locally.");
}

function daysSince(iso: string) {
  const d = new Date(iso); const now = new Date();
  return Math.max(1, Math.floor((+now - +d) / 86400000));
}

type Cand = {
  id: string; subject: Subject;
  url: string; author: { username: string; name: string };
  likes: number; created_at: string; width: number; height: number; color?: string | null;
  alt?: string | null; embed?: number[]; sim?: number; score?: number;
};

async function run() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "1"];
    })
  );
  const want = parseInt(args["want"] || "6", 10);
  const orientation = args["orientation"]; // landscape|portrait|squarish

  console.log("1) Building style centroid from ./photos …");
  const centroid = await buildCentroidFromFolder(path.join(process.cwd(), "photos"));

  console.log("2) Fetching diverse B&W candidates from Unsplash …");
  const raw = await fetchCandidates(ACCESS, ROTATION, orientation);

  console.log("3) Preparing candidates …");
  const prelim: Cand[] = raw.map((p, i) => ({
    id: p.id,
    subject: ROTATION[i % ROTATION.length],
    url: `${p.urls.raw}&auto=format&fit=crop&w=2000&q=85`,
    author: { username: p.user.username, name: p.user.name },
    likes: p.likes, created_at: p.created_at, width: p.width, height: p.height,
    color: p.color, alt: p.alt_description
  }));

  // Keep it manageable for embedding: top 200 by likes/day
  const slice = prelim
    .sort((a, b) => (b.likes / daysSince(b.created_at)) - (a.likes / daysSince(a.created_at)))
    .slice(0, 200);

  console.log("4) Embedding + scoring against your style …");
  for (const c of slice) {
    c.embed = await embedImage(c.url);
    c.sim = cosine(centroid, c.embed);
    const likesPerDay = c.likes / daysSince(c.created_at);
    const sizeBonus = Math.min((c.width * c.height) / 10_000_000, 1.0);
    c.score = 1.8 * (c.sim ?? 0) + 0.3 * likesPerDay + 0.2 * sizeBonus;
  }
  slice.sort((a, b) => (b.score! - a.score!));

  console.log("5) Enforcing variety (subjects/authors/colors) …");
  const picked: Cand[] = [];
  const bySubject: Record<Subject, number> = { faces: 0, animals: 0, structures: 0, abstract: 0, landscape: 0 };
  const authors = new Set<string>(); const colors = new Set<string>();
  const maxPerSubject = Math.max(1, Math.floor(want * SUBJECT_CAP));

  for (const c of slice) {
    if (picked.length >= want) break;
    if (bySubject[c.subject] >= maxPerSubject) continue;
    const colorKey = (c.color || "").slice(0, 7);
    if (authors.has(c.author.username)) continue;
    if (colors.has(colorKey)) continue;
    picked.push(c);
    bySubject[c.subject]++; authors.add(c.author.username); colors.add(colorKey);
  }

  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/picks.json", JSON.stringify(picked, null, 2), "utf8");
  console.log(`✅ Saved ${picked.length} picks to output/picks.json`);
}

run().catch(e => { console.error(e); process.exit(1); });