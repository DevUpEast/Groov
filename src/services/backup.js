import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { buildBackup, validateBackup, backupFileName } from '../utils/backup';
import { localDateKey } from '../utils/dates';

// Write the backup JSON to the cache dir and hand it to the share sheet (native) or
// trigger a download (web). Resolves true when the user was shown a way to save it.
export async function exportBackup(state) {
  const json = JSON.stringify(buildBackup(state), null, 2);
  const name = backupFileName(localDateKey());

  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  const file = new File(Paths.cache, name);
  file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Groov backup', UTI: 'public.json' });
  return true;
}

// Let the user pick a .json file and return the validated backup (or null if they
// cancelled). Throws with a friendly message when the file is not a Groov backup.
export async function pickBackup() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  let text;
  if (Platform.OS === 'web') {
    text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  } else {
    text = await new File(asset.uri).text();
  }
  const v = validateBackup(text);
  if (!v.ok) throw new Error(v.error);
  return v;
}
