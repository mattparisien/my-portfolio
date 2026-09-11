import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";

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
        .filter((obj) => obj.Key && (IMAGE_RE.test(obj.Key) || VIDEO_RE.test(obj.Key)))
        .slice(0, 50)
        .map(async (obj) => {
          const key = obj.Key!;
          const url = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
          const isVideo = VIDEO_RE.test(key);

          let width: number | null = null;
          let height: number | null = null;

          try {
            const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));

            width = head.Metadata?.width ? parseInt(head.Metadata.width, 10) : null;
            height = head.Metadata?.height ? parseInt(head.Metadata.height, 10) : null;

            // guard against parseInt producing NaN if metadata was stored as ""
            if (Number.isNaN(width)) width = null;
            if (Number.isNaN(height)) height = null;
          } catch (error) {
            console.error(`Failed to read metadata for ${key}`, error);
          }

          return {
            url,
            type: isVideo ? "video" : "image",
            width,
            height,
            aspectRatio: width && height ? width / height : null,
          };
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