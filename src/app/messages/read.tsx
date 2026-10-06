import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { HtmlText } from '../../components/HtmlText';
import { ErrorView, Loading } from '../../components/states';
import { Button, T } from '../../components/ui';
import { getPm } from '../../ffn/api';
import { useQuery } from '../../hooks/useQuery';
import { useTheme } from '../../theme';
import { formatDate } from '../../utils/format';

export default function ReadMessage() {
  const c = useTheme();
  const { path, subject } = useLocalSearchParams<{ path: string; subject?: string }>();
  const q = useQuery(`pmread:${path}`, () => getPm(path));
  const m = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: subject ?? 'Message' }} />
      {m ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <T size={18} weight="700">
            {m.subject || subject}
          </T>
          {!!m.from && (
            <T muted size={13} onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(m.from!.id), name: m.from!.name } })}>
              From {m.from.name}
              {m.date ? ` · ${formatDate(m.date)}` : ''}
            </T>
          )}
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
            <HtmlText html={m.html} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(m.replyPath || m.from) && (
              <Button
                title="Reply"
                icon="arrow-undo-outline"
                onPress={() =>
                  router.push({
                    pathname: '/messages/compose',
                    params: { path: m.replyPath ?? '', uid: m.from ? String(m.from.id) : '', name: m.from?.name ?? '', subject: m.subject.startsWith('re:') ? m.subject : `re: ${m.subject}` },
                  })
                }
                style={{ flex: 1 }}
              />
            )}
            <Button kind="secondary" title="Open on website" icon="globe-outline" onPress={() => router.push({ pathname: '/web', params: { path } })} />
          </View>
        </ScrollView>
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <Loading />
      )}
    </View>
  );
}
