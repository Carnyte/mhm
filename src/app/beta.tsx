import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ProfileView } from '../components/ProfileView';
import { ErrorView, Loading } from '../components/states';
import { getBetaProfile } from '../ffn/api';
import { useQuery } from '../hooks/useQuery';
import { useTheme } from '../theme';

/** Beta reader profile (/beta/{id}/{name}). */
export default function BetaScreen() {
  const c = useTheme();
  const { path, name } = useLocalSearchParams<{ path: string; name?: string }>();
  const q = useQuery(`beta:${path}`, () => getBetaProfile(path), { staleMs: 10 * 60_000 });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: q.data?.user.name ?? name ?? 'Beta reader' }} />
      {q.data ? (
        <ProfileView profile={q.data} isBeta onRefresh={q.refresh} refreshing={q.refreshing} />
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <Loading />
      )}
    </View>
  );
}
