import { apiUrl } from "./api-url";

/**
 * Raw binary upload (not apiFetch's JSON body) - matches the flyer/logo
 * routes, which read `event.request.arrayBuffer()` directly rather than
 * parsing multipart/form-data. Only usable client-side (needs a real File
 * from an <input type="file">), so unlike most of this app's data fetching
 * there's no SSR path to worry about.
 */
export async function uploadImage(url: string, file: File): Promise<boolean> {
  try {
    const response = await fetch(apiUrl(url), {
      method: "POST",
      headers: { "content-type": file.type },
      body: file,
    });
    return response.ok;
  } catch {
    return false;
  }
}
