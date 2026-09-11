// scripts/backfill-media-metadata.ts
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import sizeOf from "image-size";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "dotenv";
config({ path: ".env" });

const execFileAsync = promisify(execFile);

const BUCKET = "video";
const FOLDER = "portfolio";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
const VIDEO_RE = /\.(mp4|webm|mov)$/i;

/* -----------------------------
   List ALL objects (handles pagination)
-------------------------------- */
async function listAllObjects(prefix: string) {
  const allObjects: { Key: string }[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await r2.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of result.Contents ?? []) {
      if (obj.Key) allObjects.push({ Key: obj.Key });
    }

    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  return allObjects;
}

/* -----------------------------
   Check if metadata already exists
-------------------------------- */
async function hasMetadata(key: string): Promise<boolean> {
  try {
    const result = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return !!(result.Metadata?.width && result.Metadata?.height);
  } catch {
    return false;
  }
}

/* -----------------------------
   Get image dimensions via range read
-------------------------------- */
async function getImageDimensions(key: string) {
  const obj = await r2.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: "bytes=0-131071" }) // 128KB
  );
  const buffer = Buffer.from(await obj.Body!.transformToByteArray());
  const dimensions = sizeOf(buffer);
  return { width: dimensions.width ?? null, height: dimensions.height ?? null };
}

/* -----------------------------
   Get video dimensions via ffprobe
   (downloads full file to a temp path since moov atom
   position varies by encoding)
-------------------------------- */
async function getVideoDimensions(key: string): Promise<{ width: number | null; height: number | null }> {
  const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const buffer = Buffer.from(await obj.Body!.transformToByteArray());

  const ext = key.split(".").pop() || "mp4";
  const tmpPath = join(tmpdir(), `probe-${randomUUID()}.${ext}`);

  await writeFile(tmpPath, buffer);

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "json",
      tmpPath,
    ]);

    const parsed = JSON.parse(stdout);
    const stream = parsed?.streams?.[0];

    return {
      width: stream?.width ?? null,
      height: stream?.height ?? null,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/* -----------------------------
   Write metadata back via self-copy
-------------------------------- */
async function writeDimensions(key: string, width: number | null, height: number | null) {
  await r2.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${encodeURIComponent(key)}`,
      Key: key,
      Metadata: {
        width: String(width ?? ""),
        height: String(height ?? ""),
      },
      MetadataDirective: "REPLACE",
    })
  );
}

/* -----------------------------
   Simple concurrency-limited batch runner
-------------------------------- */
async function runInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
    console.log(`Processed ${Math.min(i + batchSize, items.length)}/${items.length}`);
  }
}

/* -----------------------------
   Main
-------------------------------- */
async function main() {
  const objects = await listAllObjects(`${FOLDER}/`);
  const mediaObjects = objects.filter(
    (obj) => IMAGE_RE.test(obj.Key) || VIDEO_RE.test(obj.Key)
  );

  console.log(`Found ${mediaObjects.length} media objects`);

  // Smaller batch size for videos since full-file downloads + ffprobe
  // are heavier than image range-reads
  const images = mediaObjects.filter((obj) => IMAGE_RE.test(obj.Key));
  const videos = mediaObjects.filter((obj) => VIDEO_RE.test(obj.Key));

  await runInBatches(images, 10, async (obj) => {
    const key = obj.Key;
    // if (await hasMetadata(key)) {
    //   console.log(`Skipping (already tagged): ${key}`);
    //   return;
    // }
    try {
      const { width, height } = await getImageDimensions(key);
      await writeDimensions(key, width, height);
      console.log(`Tagged image ${key}: ${width}x${height}`);
    } catch (error) {
      console.error(`Failed on ${key}:`, error);
    }
  });

  await runInBatches(videos, 3, async (obj) => {
    const key = obj.Key;
    // if (await hasMetadata(key)) {
    //   console.log(`Skipping (already tagged): ${key}`);
    //   return;
    // }
    try {
      const { width, height } = await getVideoDimensions(key);
      await writeDimensions(key, width, height);
      console.log(`Tagged video ${key}: ${width}x${height}`);
    } catch (error) {
      console.error(`Failed on ${key}:`, error);
    }
  });

  console.log("Done.");
}

main().catch(console.error);