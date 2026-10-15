import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { supabase } from '../utils/supabase';

// Custom habit icons (#56). The picker hands us a cache URI the OS may purge, so a
// picked image is (1) copied into the app's document directory under a stable,
// habit-id based name and (2) uploaded to the private `habit-icons` bucket as
// <userId>/<habitId>.jpg so another device (or a reinstall) can fetch it again.

const BUCKET = 'habit-icons';
const DIR_NAME = 'habit-icons';

function iconsDir() {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

export function localIconFile(habitId) {
  return new File(iconsDir(), `${habitId}.jpg`);
}

export function storagePathFor(userId, habitId) {
  return `${userId}/${habitId}.jpg`;
}

// Is this URI one of ours (already durable on this device)?
export function isDurableLocalUri(uri) {
  return typeof uri === 'string' && uri.includes(`/${DIR_NAME}/`);
}

export function localIconExists(uri) {
  if (Platform.OS === 'web' || !uri) return !!uri;
  try { return new File(uri).exists; } catch { return false; }
}

// Copy a freshly picked image to the document directory. Returns the durable URI
// (on web the picked blob/data URI is returned unchanged).
export function persistPickedIcon(habitId, sourceUri) {
  if (Platform.OS === 'web') return sourceUri;
  const dest = localIconFile(habitId);
  if (dest.exists) dest.delete();
  new File(sourceUri).copy(dest);
  return dest.uri;
}

export async function uploadIcon(userId, habitId, localUri) {
  if (!userId) return null;
  let body;
  if (Platform.OS === 'web') {
    body = await (await fetch(localUri)).blob();
  } else {
    body = await new File(localUri).bytes();
  }
  const path = storagePathFor(userId, habitId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

// Fetch the icon from the bucket into the document directory. Returns the local URI
// or null when the object is missing / offline.
export async function downloadIcon(storagePath, habitId) {
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 600);
  if (error || !data?.signedUrl) return null;
  const dest = localIconFile(habitId);
  if (dest.exists) dest.delete();
  try {
    const file = await File.downloadFileAsync(data.signedUrl, dest);
    return file.uri;
  } catch {
    return null;
  }
}

export async function removeIcon(userId, habitId, storagePath) {
  if (Platform.OS !== 'web') {
    try { const f = localIconFile(habitId); if (f.exists) f.delete(); } catch {}
  }
  if (userId && storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
  }
}
