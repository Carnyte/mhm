// Compose a private message (replays FanFiction.net's own compose form).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import { toast } from '../../components/Sheet';
import { Button, Input, T } from '../../components/ui';
import { NeedsWebError, sendPm } from '../../ffn/api';
import { pmComposePath } from '../../ffn/urls';
import { invalidate } from '../../hooks/useQuery';
import { useTheme } from '../../theme';
import { errorMessage } from '../../utils/format';

export default function Compose() {
  const c = useTheme();
  const p = useLocalSearchParams<{ uid?: string; name?: string; path?: string; subject?: string }>();
  const [uid, setUid] = useState(p.uid ?? '');
  const [subject, setSubject] = useState(p.subject ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!uid && !p.path) return toast('Choose who to send this to (their user id)', 'error');
    if (!message.trim()) return toast('Write a message first', 'error');
    setBusy(true);
    try {
      await sendPm({ userId: Number(uid) || undefined, composePath: p.path || undefined, subject: subject.trim(), message: message.trim() });
      invalidate('pm:');
      toast('Message sent', 'success');
      router.back();
    } catch (e) {
      if (e instanceof NeedsWebError) {
        toast('Finish sending on the FanFiction.net page', 'info');
        router.replace({ pathname: '/web', params: { path: e.path, title: 'New message' } });
      } else toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: p.name ? `Message ${p.name}` : 'New message', headerRight: () => <Button small title="Send" onPress={send} loading={busy} /> }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        {!p.uid && !p.path && (
          <>
            <Input placeholder="Recipient user id (from their profile URL)" value={uid} onChangeText={setUid} keyboardType="number-pad" />
            <T faint size={12}>
              Tip: open an author’s profile and tap Message to fill this in automatically.
            </T>
          </>
        )}
        <Input placeholder="Subject" value={subject} onChangeText={setSubject} />
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Write your message…"
          placeholderTextColor={c.textFaint}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 240, backgroundColor: c.surface, color: c.text, borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: c.border }}
        />
        <Button title="Send" icon="send" onPress={send} loading={busy} />
        <Button
          kind="ghost"
          title="Write it on the FanFiction.net page instead"
          onPress={() => router.replace({ pathname: '/web', params: { path: p.path || (uid ? pmComposePath(Number(uid)) : '/pm2/inbox.php'), title: 'New message' } })}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
