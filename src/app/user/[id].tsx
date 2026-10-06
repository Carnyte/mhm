import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { ErrorView, Loading } from '../../components/states';
import { getProfile } from '../../ffn/api';
import { useQuery } from '../../hooks/useQuery';
import { useTheme } from '../../theme';

export default function UserScreen() {
  const c = useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const q = useQuery(`profile:${id}`, () => getProfile(Number(id)), { staleMs: 10 * 60_000 });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: q.data?.user.name ?? name ?? 'Author' }} />
      {q.data ? (
        <ProfileView profile={q.data} onRefresh={q.refresh} refreshing={q.refreshing} />
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <Loading label="Loading profile…" />
      )}
    </View>
  );
}
