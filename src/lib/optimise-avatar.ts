import sharp from "sharp";

export const AVATAR_SUFFIX = ".optimised-v1.webp";
export const AVATAR_CACHE_SECONDS = "31536000";
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

// Keep the full composition; browsers retain their existing object-cover crop.
export async function optimiseAvatar(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) throw new Error("Photo must be between 1 byte and 10MB.");
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.format || !["jpeg", "png", "webp", "avif", "gif", "tiff", "heif"].includes(metadata.format)) {
    throw new Error("Unsupported photo format. Please use JPEG, PNG or WebP.");
  }
  if ((metadata.pages ?? 1) > 1) throw new Error("Please use a still photo rather than an animated image.");
  return image.rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 5 }).toBuffer();
}
