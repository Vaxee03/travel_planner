// Phone photos are often 5–15MB; the review photo limit is 10MB (storage
// rules) and nobody needs full resolution in a trip review. Big photos are
// scaled down to a sensible size before upload. Anything the browser can't
// decode (e.g. HEIC outside Safari) is uploaded as-is.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Returns a smaller JPEG version of `file` when it's large, otherwise the
 * original file. Never throws. */
export async function shrinkImage(file, { maxSide = 2560, quality = 0.85, minBytes = 1.5 * 1024 * 1024 } = {}) {
  if (file.size < minBytes || typeof createImageBitmap !== "function") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
