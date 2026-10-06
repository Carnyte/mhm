// Write a review (signed in, or as a guest with a name) — POST /api/ajax_review.php.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from 'react-native';
import { pickOption, toast } from '../../components/Sheet';
import { Button, Input, Row, Section, T } from '../../components/ui';
import { getStory, postReview } from '../../ffn/api';
import { invalidate } from '../../hooks/useQuery';
import { libraryStore } from '../../state/library';
import { useSession } from '../../state/session';
import { useTheme } from '../../theme';
import { countWords, errorMessage } from '../../utils/format';

export default function ComposeReview() {
  const c = useTheme();
  const session = useSession();
  const params = useLocalSearchParams<{ id: string; ch?: string; stid?: string }>();
  const id = Number(params.id);
  const lib = libraryStore.get().stories[id];
  const [chapter, setChapter] = useState(Number(params.ch) || 1);
  const [fetched, setFetched] = useState<{ chapter: number; storyTextId?: number }>();
  const [chapters, setChapters] = useState(lib?.chapters ?? 1);
  const [title, setTitle] = useState(lib?.title ?? '');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [flags, setFlags] = useState({ favStory: false, storyAlert: false, favAuthor: false, authorAlert: false });
  const [sending, setSending] = useState(false);

  // The review endpoint needs the chapter's storytextid, which comes from that chapter's page.
  useEffect(() => {
    let alive = true;
    getStory(id, chapter, { quiet: true })
      .then((s) => {
        if (!alive) return;
        setFetched({ chapter, storyTextId: s.storyTextId });
        setChapters(s.chapters);
        setTitle(s.title);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, chapter]);

  // The chapter's storytextid: from the page we fetched, or the one the reader passed in.
  const storyTextId =
    fetched?.chapter === chapter ? fetched.storyTextId : chapter === Number(params.ch) ? Number(params.stid) || undefined : undefined;

  const submit = async () => {
    if (!text.trim()) return toast('Write something first', 'error');
    if (!session.loggedIn && !name.trim()) return toast('Enter a name to review as a guest', 'error');
    if (!storyTextId) return toast('Still loading the chapter, try again in a moment', 'error');
    setSending(true);
    try {
      await postReview({ storyId: id, storyTextId, chapter, review: text.trim(), guestName: session.loggedIn ? undefined : name.trim(), flags: session.loggedIn ? flags : undefined });
      invalidate(`reviews:${id}`);
      toast('Review posted. Thank you!', 'success');
      router.back();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Write a review', headerRight: () => <Button small title="Post" onPress={submit} loading={sending} /> }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 16 }}>
          <T muted size={13}>
            Reviewing
          </T>
          <T size={17} weight="700">
            {title || `Story ${id}`}
          </T>
        </View>
        <Section>
          <Row
            title="Chapter"
            value={`Chapter ${chapter}`}
            onPress={() => pickOption('Chapter', Array.from({ length: chapters }, (_, i) => ({ value: i + 1, label: `Chapter ${i + 1}` })), chapter, setChapter)}
          />
        </Section>
        {!session.loggedIn && (
          <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 6 }}>
            <Input placeholder="Your name (guest review)" value={name} onChangeText={setName} maxLength={16} />
            <T faint size={12}>
              You’re not logged in, so this posts as a guest. Log in to review with your account.
            </T>
          </View>
        )}
        <View style={{ padding: 16 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type your review for this chapter…"
            placeholderTextColor={c.textFaint}
            multiline
            autoFocus
            textAlignVertical="top"
            style={{ minHeight: 220, backgroundColor: c.surface, color: c.text, borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: c.border }}
          />
          <T faint size={12} style={{ marginTop: 6, textAlign: 'right' }}>
            {countWords(text)} words
          </T>
        </View>
        {session.loggedIn && (
          <Section title="Also">
            <Row title="Favorite story" right={<Switch value={flags.favStory} onValueChange={(v) => setFlags({ ...flags, favStory: v })} />} />
            <Row title="Follow story" right={<Switch value={flags.storyAlert} onValueChange={(v) => setFlags({ ...flags, storyAlert: v })} />} />
            <Row title="Favorite author" right={<Switch value={flags.favAuthor} onValueChange={(v) => setFlags({ ...flags, favAuthor: v })} />} />
            <Row title="Follow author" right={<Switch value={flags.authorAlert} onValueChange={(v) => setFlags({ ...flags, authorAlert: v })} />} />
          </Section>
        )}
        <View style={{ padding: 16 }}>
          <Button title={session.loggedIn ? `Post review as ${session.username}` : 'Post guest review'} icon="send" onPress={submit} loading={sending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
