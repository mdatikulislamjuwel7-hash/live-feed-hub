import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localStatePath = join(__dirname, "..", ".data", "live-feed-state.json");
const blobStoreName = "live-feed-hub";
const blobKey = "state.json";

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

export async function readPersistedState() {
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
