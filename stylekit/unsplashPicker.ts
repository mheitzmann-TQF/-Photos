import fetch from "node-fetch";
import { Subject, SUBJECT_QUERIES } from "./subjects";

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  color?: string | null;
  likes: number;
  created_at: string;
  alt_description?: string | null;
  urls: { raw: string; full: string; regular: string; small: string };
  user: { id: string; username: string; name: string };
};

const BASE = "https://api.unsplash.com";

function q(query: string, orientation?: string) {
  const qs = new URLSearchParams({
    query,
    color: "black_and_white",
    content_filter: "high",
    per_page: "24",
  });
  if (orientation) qs.set("orientation", orientation);
  return qs.toString();
}

async function search(
  accessKey: string,
  query: string,
  order: "relevant" | "latest",
  orientation?: string
) {
  const url = `${BASE}/search/photos?${q(query, orientation)}&order_by=${order}`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status} ${res.statusText} for ${query}`);
  const json = await res.json();
  return (json.results ?? []) as UnsplashPhoto[];
}

export async function fetchCandidates(
  accessKey: string,
  subjects: Subject[],
  orientation?: string
) {
  const bag = new Map<string, UnsplashPhoto>();
  for (const s of subjects) {
    const terms = SUBJECT_QUERIES[s];
    for (const t of terms) {
      const [rel, lat] = await Promise.all([
        search(accessKey, t, "relevant", orientation),
        search(accessKey, t, "latest", orientation),
      ]);
      for (const p of [...rel, ...lat]) if (!bag.has(p.id)) bag.set(p.id, p);
    }
  }
  return [...bag.values()];
}