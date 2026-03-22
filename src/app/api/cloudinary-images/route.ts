import { NextResponse } from "next/server";
import sizeOf from "image-size";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

/* -----------------------------
   Cloudflare R2 (S3-compatible)
-------------------------------- */

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

/* -----------------------------
   Types
-------------------------------- */
type MediaItem = {
  url: string;
  type: "image" | "video";
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
};

/* -----------------------------
   Route
-------------------------------- */
export async function GET() {
  try {
    /* List all objects under the portfolio/ prefix */
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${FOLDER}/`,
    });

    const listResult = await r2.send(listCommand);
    const objects = listResult.Contents ?? [];

    const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
    const VIDEO_RE = /\.(mp4|webm|mov)$/i;

    const media: MediaItem[] = await Promise.all(
      objects
        .filter(obj => obj.Key && (IMAGE_RE.test(obj.Key) || VIDEO_RE.test(obj.Key)))
        .map(async (obj) => {
          const url = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${obj.Key}`;
          const isVideo = VIDEO_RE.test(obj.Key!);

          if (isVideo) {
            return {
              url,
              type: "video" as const,
              width: 1920,
              height: 1080,
              aspectRatio: 16 / 9,
            };
          }

          // Image — attempt to resolve dimensions
          try {
            const res = await fetch(url);
            const buffer = Buffer.from(await res.arrayBuffer());
            const dimensions = sizeOf(buffer);

            return {
              url,
              type: "image" as const,
              width: dimensions.width ?? null,
              height: dimensions.height ?? null,
              aspectRatio:
                dimensions.width && dimensions.height
                  ? dimensions.width / dimensions.height
                  : null,
            };
          } catch {
            return {
              url,
              type: "image" as const,
              width: null,
              height: null,
              aspectRatio: null,
            };
          }
        })
    );

    return NextResponse.json({ media });
  } catch (error) {
    console.error("Media API error:", error);
    return NextResponse.json(
      { media: [], error: "Failed to fetch media" },
      { status: 500 }
    );
  }
}
