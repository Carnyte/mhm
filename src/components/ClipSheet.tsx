// The preview after a tap on Clip (src/app/web.tsx): what was found on the page (story and chapter
// titles, words, the first lines, anything left out), where it goes (a new story, or the next
// chapter of a story clipped before) and Save. Saving stores only the cleaned text.

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appendClip, clippedStories, commitClip, defaultClipTarget, findClippedPage, type ClippedStory } from '../features/clips';
import { asOneChapter } from '../import/clip';
import type { ImportedBook } from '../import/types';
import { hostOf } from '../net/httpCore';
import type { StoryKey } from '../sources/keys';
import { useTheme } from '../theme';
import { errorMessage, formatFull, htmlToText, pluralize } from '../utils/format';
import { toast } from './Sheet';
import { Button, Input, T } from './ui';

/** Clipped stories offered as targets besides the page's own site's (the rest are a pick away in Library). */
const MAX_TARGETS = 12;

export interface ClipResult {
  book: ImportedBook;
  /** The page's address as it was clipped (cleaned before it's stored). */
  url: string;
}

function firstLines(book: ImportedBook): string {
  const text = htmlToText(book.chapters[0]?.html ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 280 ? text.slice(0, 280).replace(/\s+\S*$/, '') + '…' : text;
}

function Target({ label, sub, selected, onPress }: { label: string; sub?: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.target, { borderColor: selected ? c.accent : c.border, backgroundColor: c.surface }]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? c.accent : c.textFaint} />
      <View style={{ flex: 1 }}>
        <T size={15} weight="600" numberOfLines={2}>
          {label}
        </T>
        {sub ? (
          <T muted size={12} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The preview sheet. `clipFor` names the story "Clip next chapter" was opened for (the default
 * target); `onSaved` gets the story's key once the text is stored.
 */
export function ClipSheet({ result, clipFor, onClose, onSaved }: { result: ClipResult; clipFor?: string; onClose: () => void; onSaved: (key: StoryKey) => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { book, url } = result;
  const host = hostOf(url);
  const targets = useMemo(() => {
    const site = clippedStories(host);
    const asked = defaultClipTarget(url, clipFor);
    const others = clippedStories().filter((s) => s.local.clip.site !== host);
    const list: ClippedStory[] = [...(asked && asked.local.clip.site !== host ? [asked] : []), ...site, ...others.filter((s) => s.key !== asked?.key)];
    return list.slice(0, MAX_TARGETS);
  }, [host, url, clipFor]);
  const duplicate = useMemo(() => findClippedPage(url), [url]);
  const [target, setTarget] = useState<StoryKey | 'new'>(() => defaultClipTarget(url, clipFor)?.key ?? 'new');
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.authors.join(', '));
  const [oneChapter, setOneChapter] = useState(false);
  const [chapterTitle, setChapterTitle] = useState(book.chapters[0]?.title ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const several = book.chapters.length > 1 && !oneChapter;
  const story = target === 'new' ? undefined : targets.find((s) => s.key === target);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      let out = oneChapter ? asOneChapter(book, chapterTitle) : book;
      if (!several && chapterTitle.trim()) out = { ...out, chapters: [{ ...out.chapters[0], title: chapterTitle.trim() }] };
      if (story) {
        const first = await appendClip(story.key, out, url);
        const last = first + out.chapters.length - 1;
        toast(last > first ? `Added as chapters ${first}–${last} of “${story.title}”` : `Added as chapter ${first} of “${story.title}”`, 'success');
        onSaved(story.key);
      } else {
        const authors = author
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean);
        const key = await commitClip(out, { title: title.trim() || book.title, authors, url });
        toast(`Saved “${title.trim() || book.title}” to your library`, 'success');
        onSaved(key);
      }
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={saving ? undefined : onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 28, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View>
          <T size={13} weight="700" muted style={{ letterSpacing: 0.5 }}>
            {`CLIPPED FROM ${host.toUpperCase()}`}
          </T>
          <T size={22} weight="800" style={{ marginTop: 4 }} numberOfLines={3}>
            {story ? story.title : title || book.title}
          </T>
          <T muted size={14} style={{ marginTop: 4 }}>
            {several ? `${book.chapters.length} chapters found · ` : ''}
            {pluralize(book.words, 'word')}
          </T>
        </View>

        {duplicate && (
          <View style={[styles.notice, { backgroundColor: c.surfaceAlt, borderColor: c.warning }]}>
            <Ionicons name="copy-outline" size={18} color={c.warning} />
            <T size={14} style={{ flex: 1 }}>
              You clipped this page already (chapter {duplicate.chapter} of “{duplicate.story.title}”).
            </T>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <T size={14} style={{ lineHeight: 20 }}>
            {firstLines(book) || '…'}
          </T>
        </View>

        {book.chapters.length > 1 && (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <T size={15}>Keep as one chapter</T>
              <T muted size={12}>
                {oneChapter ? 'The headings stay, inside one chapter.' : book.chapters.map((ch) => ch.title).join(' · ')}
              </T>
            </View>
            <Switch value={oneChapter} onValueChange={setOneChapter} accessibilityLabel="Keep as one chapter" />
          </View>
        )}

        {!several && (
          <View style={{ gap: 6 }}>
            <T muted size={13}>
              Chapter title
            </T>
            <Input value={chapterTitle} onChangeText={setChapterTitle} placeholder="Chapter title" accessibilityLabel="Chapter title" />
          </View>
        )}

        <View style={{ gap: 8 }}>
          <T muted size={13}>
            Save to
          </T>
          {targets.map((s) => (
            <Target
              key={s.key}
              label={`Add as chapter ${s.chapters + 1} of “${s.title}”`}
              sub={`${s.local.clip.site} · ${pluralize(s.chapters, 'chapter')}`}
              selected={target === s.key}
              onPress={() => setTarget(s.key)}
            />
          ))}
          <Target label="New story" sub="A story of its own under Imported" selected={target === 'new'} onPress={() => setTarget('new')} />
        </View>

        {target === 'new' && (
          <View style={{ gap: 6 }}>
            <T muted size={13}>
              Story title
            </T>
            <Input value={title} onChangeText={setTitle} placeholder={book.title} accessibilityLabel="Story title" />
            <T muted size={13} style={{ marginTop: 6 }}>
              Author (optional)
            </T>
            <Input value={author} onChangeText={setAuthor} placeholder="Author" accessibilityLabel="Author" autoCorrect={false} />
          </View>
        )}

        {book.warnings.map((w) => (
          <T key={w} muted size={13} style={{ lineHeight: 18 }}>
            {w}
          </T>
        ))}
        {error && <T style={{ color: c.danger }}>{error}</T>}

        <Button title={duplicate ? 'Add again' : 'Save'} icon="download-outline" loading={saving} onPress={save} />
        <Button title="Cancel" kind="ghost" disabled={saving} onPress={onClose} />
        <T faint size={12} style={{ lineHeight: 17 }}>
          Only the text is kept, on this phone ({formatFull(book.words)} words; no pictures). Clipped stories aren’t in backups.
        </T>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
});
