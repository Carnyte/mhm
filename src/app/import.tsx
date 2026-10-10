// Importing story files: EPUB, HTML, plain text and Markdown, picked in the app (Library → +) or
// opened with "Open in FicShelf" from Files, Safari or Mail. Each file is read with a progress bar
// and previewed (cover, title, author, chapters, tags, where it came from, anything odd); then it's
// stored as a local story, or linked to the AO3 / FanFiction.net story it came from. A file that's
// in the library already can replace that story (keeping your place) or be kept as a second copy.
// Several files at once get a list with a status and the same choices per file.
//
// The copies the picker and iOS make for this screen are deleted once it's done with them.

import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Empty, Notice } from '../components/states';
import { Button, Chip, Input, ProgressBar, Segmented, T } from '../components/ui';
import { openStory } from '../features/actions';
import type { PickedFile } from '../features/importPicker';
import {
  commitImport,
  contentHash,
  findDuplicate,
  linkChoice,
  originLabel,
  refreshLinkedStory,
  type DuplicateMatch,
  type LinkChoice,
} from '../features/imports';
import { ImportError, MAX_INPUT_BYTES, parseImport, type ImportedBook } from '../import';
import type { StoryKey } from '../sources/keys';
import { useTheme } from '../theme';
import { errorMessage, formatFull } from '../utils/format';

type Status = 'waiting' | 'reading' | 'ready' | 'saving' | 'done' | 'failed' | 'skipped';

interface Item {
  id: string;
  file: PickedFile;
  status: Status;
  progress?: { done: number; total: number };
  book?: ImportedBook;
  hash?: string;
  error?: string;
  link?: LinkChoice;
  mode: 'local' | 'link';
  duplicate?: DuplicateMatch;
  onDuplicate: 'replace' | 'copy' | 'skip';
  title: string;
  author: string;
  key?: StoryKey;
}

const KIND_NAMES = { epub: 'EPUB', html: 'web page', txt: 'text file', md: 'Markdown file' } as const;
const MATCHED_BY = { url: 'the same story page', identifier: 'the same book', hash: 'the same file' } as const;

/** The files this screen was opened with: one from "Open in" (`file`), or the picker's (`files`). */
function filesFrom(params: { file?: string; files?: string }): PickedFile[] {
  if (params.file) {
    const uri = params.file;
    const last = uri.slice(uri.lastIndexOf('/') + 1);
    let name = last;
    try {
      name = decodeURIComponent(last);
    } catch {
      // Keep the name as it is.
    }
    return [{ uri, name: name || 'Story' }];
  }
  try {
    const list = JSON.parse(params.files ?? '[]') as PickedFile[];
    return Array.isArray(list) ? list.filter((f) => f && typeof f.uri === 'string' && typeof f.name === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Deletes the copy the picker or iOS made for this screen (Documents/Inbox, tmp/…-Inbox,
 * Caches/DocumentPicker), never anything else.
 */
function deleteCopy(uri: string) {
  if (!/[/-]Inbox\/|\/DocumentPicker\//.test(uri)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // The launch sweep gets it.
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of some bytes (the preview's cover). */
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b == null ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c == null ? '=' : B64[c & 63]);
  }
  return out;
}

function coverUri(book: ImportedBook | undefined): string | undefined {
  const img = book?.cover != null ? book.images[book.cover] : undefined;
  return img ? `data:${img.mime};base64,${base64(img.bytes)}` : undefined;
}

/** "3 chapters · 3,794 words · EPUB". */
function summaryLine(book: ImportedBook): string {
  return [`${book.chapters.length} chapter${book.chapters.length === 1 ? '' : 's'}`, `${formatFull(book.words)} words`, book.kind.toUpperCase()].join(' · ');
}

/** "This EPUB came from AO3 work 25253053." */
function originLine(book: ImportedBook): string | undefined {
  const what = KIND_NAMES[book.kind];
  if (book.origin) return `This ${what} came from ${originLabel(book.origin)}.`;
  if (book.sourceUrl) return `This ${what} came from ${book.sourceUrl.replace(/^https?:\/\//i, '')}.`;
  return undefined;
}

export default function ImportScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ file?: string; files?: string }>();
  const files = useMemo(() => filesFrom(params), [params]);
  const [items, setItems] = useState<Item[]>(() =>
    files.map((file, i) => ({ id: `${i}:${file.uri}`, file, status: 'waiting', mode: 'local', onDuplicate: 'replace', title: '', author: '' })),
  );
  const [saving, setSaving] = useState(false);
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  });
  const reading = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = (id: string, patch: Partial<Item> | ((it: Item) => Partial<Item>)) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)));

  /** Leaves the screen, stopping a read and deleting the copies made for it. */
  const close = () => {
    reading.current?.abort();
    for (const it of itemsRef.current) if (it.status !== 'saving' && it.status !== 'done') deleteCopy(it.file.uri);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Read the files one after another (leaving the screen stops it).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ctrl = new AbortController();
    reading.current = ctrl;
    const signal = ctrl.signal;
    (async () => {
      for (const it of itemsRef.current) {
        if (signal.aborted) return;
        update(it.id, { status: 'reading' });
        try {
          const f = new File(it.file.uri);
          const size = it.file.size ?? f.size ?? 0;
          if (size > MAX_INPUT_BYTES) throw new ImportError('too-large', 'This file is too large to import (over 100 MB).');
          const bytes = await f.bytes();
          const book = await parseImport(bytes, it.file.name, { signal, onProgress: (done, total) => update(it.id, { progress: { done, total } }) });
          const hash = contentHash(bytes, it.file.uri);
          const link = linkChoice(book);
          update(it.id, {
            status: 'ready',
            book,
            hash,
            file: { ...it.file, size: bytes.length },
            link,
            mode: link?.suggested ? 'link' : 'local',
            duplicate: findDuplicate(book, hash),
            title: book.title,
            author: book.authors.join(', '),
            progress: undefined,
          });
        } catch (e) {
          if (signal.aborted) return;
          update(it.id, { status: 'failed', error: errorMessage(e), progress: undefined });
          deleteCopy(it.file.uri);
        }
      }
    })();
    return () => ctrl.abort();
  }, []);

  const save = async () => {
    setSaving(true);
    const saved: Item[] = [];
    for (const it of itemsRef.current) {
      if (it.status !== 'ready' || !it.book || !it.hash) continue;
      const replace = it.mode === 'local' && it.duplicate && it.onDuplicate === 'replace' ? it.duplicate.story.key : undefined;
      if (it.mode === 'local' && it.duplicate && it.onDuplicate === 'skip') {
        update(it.id, { status: 'skipped' });
        deleteCopy(it.file.uri);
        continue;
      }
      update(it.id, { status: 'saving', progress: { done: 0, total: it.book.chapters.length } });
      try {
        const key = await commitImport(
          it.book,
          { name: it.file.name, size: it.file.size ?? 0, contentHash: it.hash, uri: it.file.uri },
          {
            mode: it.mode,
            replace,
            title: it.title,
            authors: it.author.split(',').map((a) => a.trim()),
            onProgress: (done, total) => update(it.id, { progress: { done, total } }),
          },
        );
        // Of several files, a saved book isn't needed any more (a long one is a lot of memory);
        // a single one stays on screen until its story page opens.
        update(it.id, { status: 'done', key, progress: undefined, ...(itemsRef.current.length > 1 ? { book: undefined } : {}) });
        saved.push({ ...it, key });
      } catch (e) {
        update(it.id, { status: 'failed', error: errorMessage(e), progress: undefined });
      } finally {
        deleteCopy(it.file.uri);
      }
    }
    setSaving(false);
    const single = itemsRef.current.length === 1;
    if (single && saved[0]?.key && mounted.current) {
      // The story page asks a linked story's site for its details as it opens.
      router.replace({ pathname: '/story/[id]', params: { id: saved[0].key } });
      return;
    }
    // Linked stories get their site's details once, one after another (the site's spacing applies).
    for (const it of saved) if (it.mode === 'link' && it.key) await refreshLinkedStory(it.key);
  };

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: 'Import' }} />
        <Empty
          icon="phone-portrait-outline"
          title="Importing works in the iPhone app"
          message="Open FicShelf on your iPhone to import EPUB, HTML, text and Markdown files."
        />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: 'Import' }} />
        <Empty
          icon="document-outline"
          title="No file to import"
          message="Pick EPUB, HTML, text or Markdown files from Library → +."
          action={{ label: 'Close', onPress: close }}
        />
      </View>
    );
  }

  // No swiping the sheet away while stories are being saved.
  const header = <Stack.Screen options={{ title: items.length > 1 ? `Import ${items.length} files` : 'Import', gestureEnabled: !saving }} />;
  if (items.length === 1)
    return <Single item={items[0]} header={header} saving={saving} onChange={(p) => update(items[0].id, p)} onSave={save} onClose={close} />;

  const ready = items.filter((it) => it.status === 'ready');
  const busy = items.some((it) => it.status === 'waiting' || it.status === 'reading');
  const finished = !saving && items.every((it) => it.status === 'done' || it.status === 'failed' || it.status === 'skipped');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}>
        {items.map((it) => (
          <Row key={it.id} item={it} saving={saving} onChange={(p) => update(it.id, p)} />
        ))}
        {finished ? (
          <Button title="Done" icon="checkmark" onPress={close} />
        ) : (
          <Button
            title={saving ? 'Importing…' : busy ? 'Reading files…' : `Import ${ready.length} ${ready.length === 1 ? 'story' : 'stories'}`}
            icon="download-outline"
            disabled={busy || saving || !ready.length}
            onPress={save}
          />
        )}
        {!finished && <Button title="Cancel" kind="ghost" disabled={saving} onPress={close} />}
      </ScrollView>
    </View>
  );
}

/** Reading / saving progress: "Reading chapter 3 of 12". */
function Progress({ item }: { item: Item }) {
  const p = item.progress;
  const verb = item.status === 'saving' ? 'Saving' : 'Reading';
  return (
    <View style={{ gap: 6 }}>
      <T muted size={13}>
        {p && p.total > 0 ? `${verb} chapter ${Math.min(p.done + (item.status === 'saving' ? 0 : 1), p.total)} of ${p.total}` : `${verb} ${item.file.name}…`}
      </T>
      <ProgressBar value={p && p.total ? p.done / p.total : 0} />
    </View>
  );
}

/** Link to the site's story, or keep it as a local story. */
function LinkPicker({ item, onChange, compact }: { item: Item; onChange: (p: Partial<Item>) => void; compact?: boolean }) {
  const link = item.link!;
  const n = item.book?.chapters.length ?? 0;
  if (compact) {
    return (
      <Segmented<Item['mode']>
        options={[
          { value: 'link', label: `Link to ${link.site}` },
          { value: 'local', label: 'Local story' },
        ]}
        value={item.mode}
        onChange={(mode) => onChange({ mode })}
      />
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Choice
        selected={item.mode === 'link'}
        title={`Link to ${link.label}`}
        subtitle={
          link.existing
            ? `Fills in “${link.existing.title}” in your library with this file's chapters. Your progress, bookmarks and collections stay.`
            : `It becomes that ${link.site} story in your library, with this file's chapters saved for reading offline, updates and its page on ${link.site}. FicShelf asks ${link.site} for its details once now.`
        }
        onPress={() => onChange({ mode: 'link' })}
      />
      <Choice
        selected={item.mode === 'local'}
        title="Keep as a local story"
        subtitle="Only on this device, exactly as in the file. No update checks."
        onPress={() => onChange({ mode: 'local' })}
      />
      {!link.suggested && link.existing && (
        <T faint size={12}>
          Your library has {link.existing.chapters} chapters of this {link.site} story; this file has {n}.
        </T>
      )}
    </View>
  );
}

/** Replace the story already imported, keep both, or (several files) skip this one. */
function DuplicatePicker({ item, onChange, compact }: { item: Item; onChange: (p: Partial<Item>) => void; compact?: boolean }) {
  const dup = item.duplicate!;
  if (compact) {
    return (
      <Segmented<Item['onDuplicate']>
        options={[
          { value: 'replace', label: 'Replace' },
          { value: 'copy', label: 'Keep both' },
          { value: 'skip', label: 'Skip' },
        ]}
        value={item.onDuplicate}
        onChange={(onDuplicate) => onChange({ onDuplicate })}
      />
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Notice icon="copy-outline" title={`Already in your library: “${dup.story.title}”`} message={`Recognised by ${MATCHED_BY[dup.by]}.`} />
      <Choice
        selected={item.onDuplicate === 'replace'}
        title="Replace it"
        subtitle="The new file's text, with your place, read chapters and bookmarks kept (chapters are matched by title)."
        onPress={() => onChange({ onDuplicate: 'replace' })}
      />
      <Choice
        selected={item.onDuplicate === 'copy'}
        title="Keep both"
        subtitle="Import this file as another story."
        onPress={() => onChange({ onDuplicate: 'copy' })}
      />
    </View>
  );
}

function Choice({ selected, title, subtitle, onPress }: { selected: boolean; title: string; subtitle?: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.choice, { backgroundColor: c.surface, borderColor: selected ? c.accent : c.border }]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? c.accent : c.textFaint} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <T size={15} weight="600">
          {title}
        </T>
        {!!subtitle && (
          <T muted size={13} style={{ marginTop: 2, lineHeight: 18 }}>
            {subtitle}
          </T>
        )}
      </View>
    </Pressable>
  );
}

/** One file: the full preview. */
function Single({
  item,
  header,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  item: Item;
  header: ReactNode;
  saving: boolean;
  onChange: (p: Partial<Item>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const book = item.book;
  const cover = useMemo(() => coverUri(book), [book]);
  if (item.status === 'waiting' || item.status === 'reading') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, justifyContent: 'center' }}>
        {header}
        <Progress item={item} />
        <Button title="Cancel" kind="ghost" onPress={onClose} style={{ marginTop: 16 }} />
      </View>
    );
  }
  if (item.status === 'failed' || !book) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <Empty
          icon="alert-circle-outline"
          title="Can’t import this file"
          message={item.error ?? 'Something went wrong.'}
          action={{ label: 'Close', onPress: onClose }}
        />
      </View>
    );
  }
  const linked = item.mode === 'link';
  const replacing = !linked && item.duplicate && item.onDuplicate === 'replace';
  const origin = originLine(book);
  const tags = (book.tags ?? []).filter((t) => t.kind !== 'rating').slice(0, 14);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {cover ? (
            <Image source={{ uri: cover }} style={[styles.cover, { backgroundColor: c.surfaceAlt }]} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.cover, { backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="document-text-outline" size={34} color={c.textFaint} />
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <T size={19} weight="800" numberOfLines={3}>
              {item.title || book.title}
            </T>
            {!!(item.author || book.authors.length) && (
              <T muted size={14} numberOfLines={2}>
                by {item.author || book.authors.join(', ')}
              </T>
            )}
            <T faint size={13}>
              {summaryLine(book)}
            </T>
            {!!book.rating && (
              <T faint size={13}>
                Rated {book.rating}
              </T>
            )}
          </View>
        </View>

        {!!origin && (
          <Notice
            icon="globe-outline"
            title={origin}
            message={book.origin?.source === 'wp' ? 'Wattpad files are imported as local stories; the link to the story is kept.' : undefined}
          />
        )}

        {item.link && <LinkPicker item={item} onChange={onChange} />}

        {!linked && (
          <View style={{ gap: 8 }}>
            <Input placeholder="Title" value={item.title} onChangeText={(title) => onChange({ title })} accessibilityLabel="Title" />
            <Input
              placeholder="Author (several: separate with commas)"
              value={item.author}
              onChangeText={(author) => onChange({ author })}
              accessibilityLabel="Author"
            />
          </View>
        )}

        {!linked && item.duplicate && <DuplicatePicker item={item} onChange={onChange} />}

        {book.warnings.map((w) => (
          <Notice key={w} icon="warning-outline" title={w} />
        ))}

        {tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((t) => (
              <Chip key={`${t.kind}:${t.label}`} label={t.label} />
            ))}
            {(book.tags?.length ?? 0) > tags.length && <Chip label={`+${(book.tags?.length ?? 0) - tags.length} more`} />}
          </View>
        )}

        {!!book.summary && (
          <T size={14} numberOfLines={8} style={{ lineHeight: 20 }}>
            {book.summary}
          </T>
        )}

        <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          {book.chapters.slice(0, 8).map((ch, i) => (
            <View key={i} style={styles.chapter}>
              <T faint size={13} style={{ width: 30 }}>
                {i + 1}
              </T>
              <T size={14} numberOfLines={1} style={{ flex: 1 }}>
                {ch.title}
              </T>
              <T faint size={12}>
                {formatFull(ch.words)}
              </T>
            </View>
          ))}
          {book.chapters.length > 8 && (
            <T faint size={13} style={{ padding: 10 }}>
              and {book.chapters.length - 8} more chapters
            </T>
          )}
        </View>

        {saving || item.status === 'saving' ? (
          <Progress item={item} />
        ) : (
          <Button
            title={linked ? `Link and import` : replacing ? 'Replace and import' : 'Import'}
            icon="download-outline"
            onPress={onSave}
            disabled={item.status !== 'ready'}
          />
        )}
        <Button title="Cancel" kind="ghost" disabled={saving} onPress={onClose} />
      </ScrollView>
    </View>
  );
}

/** One file of several: status, a summary, its choices, and a way to its story once saved. */
function Row({ item, saving, onChange }: { item: Item; saving: boolean; onChange: (p: Partial<Item>) => void }) {
  const c = useTheme();
  const book = item.book;
  const icon =
    item.status === 'done'
      ? { name: 'checkmark-circle' as const, color: c.success }
      : item.status === 'failed'
        ? { name: 'alert-circle' as const, color: c.danger }
        : item.status === 'skipped'
          ? { name: 'remove-circle-outline' as const, color: c.textFaint }
          : { name: 'document-text-outline' as const, color: c.textMuted };
  const subtitle =
    item.status === 'failed'
      ? item.error
      : item.status === 'skipped'
        ? 'Skipped: it’s in your library already.'
        : item.status === 'done'
          ? `Imported${item.mode === 'link' && item.link ? ` as ${item.link.label}` : ''}. Tap to open it.`
          : book
            ? [summaryLine(book), book.origin ? `from ${originLabel(book.origin)}` : undefined].filter(Boolean).join(' · ')
            : undefined;
  return (
    <Pressable
      onPress={() => item.key && openStory(item.key)}
      disabled={!item.key}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityRole={item.key ? 'button' : undefined}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Ionicons name={icon.name} size={22} color={icon.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15} weight="600" numberOfLines={2}>
            {item.title || item.file.name}
          </T>
          {!!subtitle && (
            <T muted size={12} style={{ color: item.status === 'failed' ? c.danger : undefined }}>
              {subtitle}
            </T>
          )}
        </View>
        {item.key && <Ionicons name="chevron-forward" size={18} color={c.textFaint} />}
      </View>
      {(item.status === 'reading' || item.status === 'saving') && <Progress item={item} />}
      {item.status === 'ready' && !saving && (
        <View style={{ gap: 8 }}>
          {item.link && <LinkPicker item={item} onChange={onChange} compact />}
          {item.mode === 'local' && item.duplicate && (
            <>
              <T faint size={12}>
                Already in your library as “{item.duplicate.story.title}” ({MATCHED_BY[item.duplicate.by]}).
              </T>
              <DuplicatePicker item={item} onChange={onChange} compact />
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { width: 96, height: 128, borderRadius: 8, overflow: 'hidden' },
  choice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  box: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 9 },
  row: { padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
});
