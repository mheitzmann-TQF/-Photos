import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import sharp from "sharp";
import { pipeline } from "@xenova/transformers";

let clipPipe: any;
async function getClip() {
  if (!clipPipe) clipPipe = await pipeline("feature-extraction", "Xenova/clip-vit-base-patch32");
  return clipPipe;
}

async function readImageBuffer(src: string): Promise<Buffer> {
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(src);
}

async function preprocess(buf: Buffer): Promise<Uint8Array> {
  const out = await sharp(buf)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .toFormat("jpeg")
    .toBuffer();
  return new Uint8Array(out);
}

export async function embedImage(src: string): Promise<number[]> {
  const p = await getClip();
  const pre = await preprocess(await readImageBuffer(src));
  const out = await p(pre, { pooling: "mean", normalize: true });
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
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function buildCentroidFromFolder(folder: string) {
  const files = fs.readdirSync(folder)
    .filter(f => /\.(jpe?g|png)$/i.test(f))
    .map(f => path.join(folder, f));
  if (!files.length) throw new Error(`No images found in ${folder}`);
  const vecs: number[][] = [];
  for (const f of files) vecs.push(await embedImage(f));
  return average(vecs);
}