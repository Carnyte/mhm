// Files the app keeps in its Documents folder for imported stories (covers, images), named by a
// path relative to that folder: its absolute location changes between installs, so only relative
// paths are stored. A stored cover URL names one as `ficshelf-doc:<path>`.

import { File, Paths } from 'expo-file-system';

export const DOC_PREFIX = 'ficshelf-doc:';

/** Only paths the importer writes: a file in a story's folder under imports/, or in its img/. */
const SAFE_PATH = /^imports\/[a-z0-9_-]{1,80}\/(?:img\/)?[a-z0-9_-]{1,40}\.[a-z0-9]{1,8}$/i;

/** `ficshelf-doc:<path>` for a path relative to Documents. */
export function docRef(path: string): string {
  return DOC_PREFIX + path;
}

/** Whether a path relative to Documents is one the importer could have written. */
export function isImportPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

/** The file URI a `ficshelf-doc:` reference points to, or null when it isn't one the app made. */
export function docUri(ref: string): string | null {
  if (!ref.startsWith(DOC_PREFIX)) return null;
  const path = ref.slice(DOC_PREFIX.length);
  if (!isImportPath(path)) return null;
  try {
    return new File(Paths.document, ...path.split('/')).uri;
  } catch {
    return null;
  }
}
