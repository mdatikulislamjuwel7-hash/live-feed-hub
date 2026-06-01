import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localStatePath = join(__dirname, "..", ".data", "live-feed-state.json");
const blobStoreName = "live-feed-hub";
const blobKey = "state.json";
const vercelBlobPath = "live-feed-state.json";

async function readLocalState() {
  try {
    return JSON.parse(await readFile(localStatePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeLocalState(state) {
  await mkdir(dirname(localStatePath), { recursive: true });
  await writeFile(localStatePath, JSON.stringify(state, null, 2));
}

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore(blobStoreName);
}

async function readVercelBlobState() {
  const url = process.env.LIVE_FEED_STATE_BLOB_URL;
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function writeVercelBlobState(state) {
  const { put } = await import("@vercel/blob");
  const { url } = await put(vercelBlobPath, JSON.stringify(state), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  if (!process.env.LIVE_FEED_STATE_BLOB_URL) {
    console.warn(`[persistence] set LIVE_FEED_STATE_BLOB_URL=${url} in Vercel env to read stored state after cold starts`);
  }
}

export async function readPersistedState() {
  if (process.env.VERCEL) {
    try {
      return await readVercelBlobState();
    } catch (err) {
      console.warn(`[persistence] vercel blob read failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
  if (process.env.NETLIFY) {
    try {
      const store = await getBlobStore();
      return await store.get(blobKey, { type: "json" });
    } catch (err) {
      console.warn(`[persistence] blob read failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
  return readLocalState();
}

export async function writePersistedState(state) {
  if (process.env.VERCEL) {
    try {
      await writeVercelBlobState(state);
      return;
    } catch (err) {
      console.warn(`[persistence] vercel blob write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (process.env.NETLIFY) {
    try {
      const store = await getBlobStore();
      await store.setJSON(blobKey, state);
      return;
    } catch (err) {
      console.warn(`[persistence] blob write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await writeLocalState(state);
}
