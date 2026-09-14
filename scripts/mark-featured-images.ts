import { config } from "dotenv";
import {
    CopyObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    S3Client,
} from "@aws-sdk/client-s3";

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

// This list is the SOURCE OF TRUTH for which images are featured.
// - Any image in this list gets isfeatured = "true".
// - Any image in the bucket that currently has the flag but is NOT in this
//   list gets the flag removed.
const FEATURED_IMAGE_URLS = [



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

// Rebuild the metadata map, preserving everything except the featured flag,
// then set or remove that flag based on `featured`.
function buildMetadata(
    existingMetadata: Record<string, string> | undefined,
    featured: boolean
) {
    const metadata: Record<string, string> = { ...existingMetadata };

    for (const key of Object.keys(metadata)) {
        // strip empties
        if (metadata[key] === undefined || metadata[key] === null || metadata[key] === "") {
            delete metadata[key];
            continue;
        }
        // strip any existing featured flag (case-insensitive, just in case)
        if (key.toLowerCase() === FEATURED_METADATA_KEY) {
            delete metadata[key];
        }
    }

    if (featured) {
        metadata[FEATURED_METADATA_KEY] = "true";
    }

    return metadata;
}

// List every object under the folder, handling pagination.
async function listAllKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
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
            // skip folder placeholder objects
            if (obj.Key && !obj.Key.endsWith("/")) {
                keys.push(obj.Key);
            }
        }

        continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return keys;
}

// Write the featured flag on/off via an in-place self-copy.
async function setFeatured(
    key: string,
    featured: boolean,
    existingMetadata: Record<string, string> | undefined
) {
    const encodedKey = encodeCopySourceKey(key);

    await r2.send(
        new CopyObjectCommand({
            Bucket: BUCKET,
            CopySource: `${BUCKET}/${encodedKey}`,
            Key: key,
            Metadata: buildMetadata(existingMetadata, featured),
            MetadataDirective: "REPLACE",
        })
    );
}

// Simple concurrency-limited batch runner.
async function runInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>) {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(fn));
    }
}

async function main() {
    if (!PUBLIC_URL) {
        throw new Error(
            "Missing CLOUDFLARE_R2_PUBLIC_URL in your environment. Add it to .env before running this script."
        );
    }

    // Desired featured set (source of truth).
    const desiredKeys = new Set(
        FEATURED_IMAGE_URLS.filter((url) => url && url.trim().length > 0).map((url) =>
            normalizeKey(url)
        )
    );

    if (desiredKeys.size === 0) {
        console.warn(
            "FEATURED_IMAGE_URLS is empty — this will REMOVE the featured flag from every image in the folder."
        );
    }

    const allKeys = await listAllKeys(`${FOLDER}/`);
    console.log(`Reconciling ${allKeys.length} object(s) against ${desiredKeys.size} featured image(s)...`);

    const foundDesired = new Set<string>();
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    await runInBatches(allKeys, 8, async (key) => {
        try {
            const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
            const currentlyFeatured = head.Metadata?.[FEATURED_METADATA_KEY] === "true";
            const shouldBeFeatured = desiredKeys.has(key);

            if (shouldBeFeatured) {
                foundDesired.add(key);
            }

            if (shouldBeFeatured && !currentlyFeatured) {
                await setFeatured(key, true, head.Metadata);
                added++;
                console.log(`+ Marked featured: ${key}`);
            } else if (!shouldBeFeatured && currentlyFeatured) {
                await setFeatured(key, false, head.Metadata);
                removed++;
                console.log(`- Removed featured flag: ${key}`);
            } else {
                unchanged++;
            }
        } catch (error) {
            console.error(`Failed on ${key}:`, error);
        }
    });

    // Warn about URLs in the list that don't correspond to a real object.
    for (const key of desiredKeys) {
        if (!foundDesired.has(key)) {
            console.warn(`! Listed as featured but not found in bucket: ${key}`);
        }
    }

    console.log(`Done. Added: ${added}, Removed: ${removed}, Unchanged: ${unchanged}.`);
}

main().catch((error) => {
    console.error("Featured image update failed:", error);
    process.exitCode = 1;
});