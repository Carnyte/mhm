// Draft editor: autosave, word count, tags, export (.txt / .html share sheet), copy, Doc Manager.

import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { showActions, toast } from '../../components/Sheet';
import { Chip, IconButton, T } from '../../components/ui';
import { ACCOUNT_PATHS } from '../../ffn/urls';
import { deleteDraft, libraryStore, saveDraft } from '../../state/library';
import { useTheme } from '../../theme';
import { countWords } from '../../utils/format';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function DraftEditor() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const initial = libraryStore.get().drafts.find((d) => d.id === id);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Autosave shortly after typing stops.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveDraft({ id, title, body, tags }), 600);
    return () => clearTimeout(timer.current);
  }, [id, title, body, tags]);

  const exportAs = async (kind: 'txt' | 'html') => {
    const safe = (title || 'draft').replace(/[^\w\- ]+/g, '').trim() || 'draft';
    const content =
      kind === 'txt'
        ? `${title}\n\n${body}`
        : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${body
            .split(/\n{2,}/)
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
            .join('\n')}</body></html>`;
    try {
      const file = new File(Paths.cache, `${safe}.${kind}`);
      if (file.exists) file.delete();
      file.create();
      file.write(content);
      await Sharing.shareAsync(file.uri, { mimeType: kind === 'txt' ? 'text/plain' : 'text/html', dialogTitle: 'Export draft', UTI: kind === 'txt' ? 'public.plain-text' : 'public.html' });
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, 'error');
    }
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: title || 'Draft',
          headerRight: () => (
            <IconButton
              icon="share-outline"
              label="Export"
              onPress={() =>
                showActions(
                  [
                    { label: 'Copy text', icon: 'copy-outline', onPress: () => Clipboard.setStringAsync(body).then(() => toast('Copied')) },
                    { label: 'Export as .txt', icon: 'document-outline', onPress: () => exportAs('txt') },
                    { label: 'Export as .html (Pages / Word)', icon: 'document-text-outline', onPress: () => exportAs('html') },
                    { label: 'Open Doc Manager', icon: 'cloud-upload-outline', onPress: () => router.push({ pathname: '/web', params: { path: ACCOUNT_PATHS.docManager, title: 'Doc Manager' } }) },
                    {
                      label: 'Delete draft',
                      icon: 'trash-outline',
                      destructive: true,
                      onPress: () => {
                        deleteDraft(id);
                        router.back();
                      },
                    },
                  ],
                  'Draft',
                  'Doc Manager accepts pasted text or uploaded .txt / .html files.',
                )
              }
            />
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={c.textFaint}
          style={{ fontSize: 22, fontWeight: '700', color: c.text, paddingVertical: 6 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {tags.map((t) => (
            <Chip key={t} label={`#${t}`} onRemove={() => setTags(tags.filter((x) => x !== t))} />
          ))}
          <TextInput
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={addTag}
            placeholder="+ tag"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            style={{ color: c.text, minWidth: 80, paddingVertical: 4 }}
            returnKeyType="done"
          />
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Start writing…"
          placeholderTextColor={c.textFaint}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 420, fontSize: 17, lineHeight: 26, color: c.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }}
        />
        <T faint size={12} style={{ textAlign: 'right' }}>
          {countWords(body).toLocaleString()} words · saved automatically
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
