// Saving a generated file (calendar .ics, itinerary/invite images). A browser
// downloads it; the app can't (its WebView ignores <a download>), so there
// the file is written to the app's cache and handed to the phone's share
// sheet — from which it can be saved, opened in Calendar, or sent on.
import { isNativeApp } from "./platform";

function downloadInBrowser(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function shareFromApp(filename, blob) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const path = filename.replace(/[\\/:*?"<>|]/g, "_");
  const { uri } = await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (err) {
    if (!/cancel/i.test(String(err?.message))) throw err; // closing the sheet is fine
  }
}

/** Saves `dataOrBlob` (text or a Blob) as `filename`. */
export function saveFile(filename, dataOrBlob) {
  const blob = dataOrBlob instanceof Blob ? dataOrBlob : new Blob([dataOrBlob], { type: "text/plain" });
  if (isNativeApp) return shareFromApp(filename, blob);
  downloadInBrowser(filename, blob);
  return Promise.resolve();
}
