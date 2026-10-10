// "Import a file" (Library → +, Settings): the system file picker, then the import screen.

import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { toast } from '../components/Sheet';
import { IMPORT_MIME_TYPES } from '../import';
import { errorMessage } from '../utils/format';
import { handOff, type PickedFile } from './importHandoff';

export type { PickedFile } from './importHandoff';

/**
 * Lets the user pick story files (several at once) and opens the import screen with them. MIME
 * types only: the picker silently drops UTI strings. The picker hands over copies in the app's
 * cache, which the import screen deletes when it's done.
 */
export async function pickStoryFiles() {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: IMPORT_MIME_TYPES, multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const files: PickedFile[] = res.assets.map((a) => ({ uri: a.uri, name: a.name, ...(a.size != null ? { size: a.size } : {}) }));
    router.push({ pathname: '/import', params: { open: handOff(files) } });
  } catch (e) {
    toast(`Couldn’t open the file picker: ${errorMessage(e)}`, 'error');
  }
}
