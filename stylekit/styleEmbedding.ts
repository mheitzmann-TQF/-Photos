import fs from "fs";
import path from "path";
import { pipeline } from "@xenova/transformers";

// one global pipeline
let clipPipe: any;
async function getClip() {
  if (!clipPipe) {
    clipPipe = await pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32");
  }
  return clipPipe;
}

export async function embedImage(src: string): Promise<number[]> {
  const p = await getClip();
  // Hand the pipeline a string: either a local file path or an http(s) URL.
  const out = await p(src, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

export function average(vectors: number[][]): number[] {
  const n = vectors.length, dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) sum[i] += v[i];
  return sum.map(x => x / n);
}

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function buildCentroidFromFolder(folder: string) {
  const files = fs.readdirSync(folder)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .map(f => path.resolve(folder, f)); // make absolute paths
  if (!files.length) throw new Error(`No images found in ${folder}`);
  const vecs: number[][] = [];
  for (const absPath of files) {
    vecs.push(await embedImage(absPath)); // pass the path string directly
  }
  return average(vecs);
}