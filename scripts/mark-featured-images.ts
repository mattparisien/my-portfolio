import { config } from "dotenv";
import { CopyObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: ".env" });

const BUCKET = "video";
const FOLDER = "portfolio";
const PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/+$/, "");

const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
});

const FEATURED_IMAGE_URLS = [
    "https://pub-30fe8059e35c45f19228bc5cf59ce0a5.r2.dev/portfolio/DSC_7474-Edit-2.jpg"

    // Add additional image URLs here.
] as const;

// NOTE: S3/R2 lowercases user-metadata keys on write (they're sent as
// x-amz-meta-* headers, which are case-insensitive). Whatever case you set
// here, it will come back as "isfeatured" when you HeadObject/GetObject
// later. Standardizing on lowercase here avoids the mismatch.
const FEATURED_METADATA_KEY = "isfeatured";

function normalizeKey(url: string): string {
    const trimmed = url.trim();

    if (!trimmed) {
        throw new Error("Encountered an empty URL.");
    }

    if (PUBLIC_URL && trimmed.startsWith(`${PUBLIC_URL}/`)) {
        return trimmed.slice(`${PUBLIC_URL}/`.length);
    }

    if (trimmed.startsWith(`${FOLDER}/`)) {
        return trimmed;
    }

    if (trimmed.startsWith(`/${FOLDER}/`)) {
        return trimmed.slice(`/${FOLDER}/`.length + 1);
    }

    const withoutHost = trimmed.replace(/^https?:\/\/[^/]+\//i, "");

    if (withoutHost.startsWith(`${FOLDER}/`)) {
        return withoutHost;
    }

    throw new Error(`Could not normalize URL to a storage key: ${url}`);
}

// Encode each path segment individually so "/" separators in the key are
// preserved. encodeURIComponent() on the whole key would turn "/" into
// "%2F", producing a CopySource that doesn't resolve to the real object.
function encodeCopySourceKey(key: string): string {
    return key
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}

function buildMetadata(existingMetadata: Record<string, string> | undefined) {
    const metadata: Record<string, string> = { ...existingMetadata };

    for (const key of Object.keys(metadata)) {
        if (metadata[key] === undefined || metadata[key] === null || metadata[key] === "") {
            delete metadata[key];
        }
    }

    metadata[FEATURED_METADATA_KEY] = "true";

    return metadata;
}

async function markFeatured(key: string) {
    const result = await r2.send(
        new HeadObjectCommand({
            Bucket: BUCKET,
            Key: key,
        })
    );

    // if (result.Metadata?.[FEATURED_METADATA_KEY] === "true") {
    //     console.log(`Skipping ${key} (already featured)`);
    //     return;
    // }

    const encodedKey = encodeCopySourceKey(key);

    await r2.send(
        new CopyObjectCommand({
            Bucket: BUCKET,
            CopySource: `${BUCKET}/${encodedKey}`,
            Key: key,
            Metadata: buildMetadata(result.Metadata),
            MetadataDirective: "REPLACE",
        })
    );

    console.log(`Marked featured: ${key}`);
}

async function main() {
    if (!PUBLIC_URL) {
        throw new Error(
            "Missing CLOUDFLARE_R2_PUBLIC_URL in your environment. Add it to .env before running this script."
        );
    }

    const urls = FEATURED_IMAGE_URLS.filter((url) => url && url.trim().length > 0);

    if (urls.length === 0) {
        throw new Error("FEATURED_IMAGE_URLS is empty. Add the image URLs you want to mark as featured.");
    }

    console.log(`Marking ${urls.length} image(s) as featured...`);

    for (const url of urls) {
        const key = normalizeKey(url);

        try {
            await markFeatured(key);
        } catch (error) {
            console.error(`Failed to mark ${url}:`, error);
        }
    }

    console.log("Done.");
}

main().catch((error) => {
    console.error("Featured image update failed:", error);
    process.exitCode = 1;
});