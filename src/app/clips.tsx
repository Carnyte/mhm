// "Clipping in the background": every background clipping job (src/features/clipJobs.ts), the one
// running first: its story, how many chapters it saved, what it's doing or waiting for, and
// Pause / Continue / Stop. A job waiting for the user shows its page from here too.

import { router, Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Empty } from '../components/states';
import { Button, Card, T } from '../components/ui';
import { clipEngine, clipRunStore, useClipJobs, type ClipJob } from '../features/clipJobs';
import { useStore } from '../state/store';
import { useTheme } from '../theme';
import { pluralize, relativeMs } from '../utils/format';

const PHASES: Record<string, string> = {
  reading: 'Reading the chapter…',
  saving: 'Saving…',
  waiting: 'Waiting a moment, as a reader would…',
  loading: 'Opening the next chapter…',
};

function stateLine(job: ClipJob, phase?: string): string {
  switch (job.state) {
    case 'running':
      return phase ? (PHASES[phase] ?? 'Clipping…') : 'Starting…';
    case 'queued':
      return 'Waiting for the clipping before it to finish';
    case 'needs-user':
      return job.message ?? 'Waiting for you on the page.';
    case 'paused':
      return 'Paused. It goes on from the last clipped page.';
    default:
      return job.message ?? (job.state === 'done' ? 'Finished.' : 'Stopped.');
  }
}

function JobCard({ job }: { job: ClipJob }) {
  const c = useTheme();
  const run = useStore(clipRunStore, (s) => s);
  const phase = run.id === job.id && run.status?.state === 'running' ? run.status.phase : undefined;
  const live = job.state !== 'done' && job.state !== 'stopped';
  return (
    <Card style={{ gap: 8 }}>
      <T size={16} weight="700" numberOfLines={2}>
        {job.title || job.site}
      </T>
      <T muted size={13}>
        {job.site} · {pluralize(job.saved, 'chapter')} saved · {relativeMs(job.updatedAt)}
      </T>
      <T size={14} style={{ color: job.state === 'needs-user' ? c.warning : c.text }}>
        {stateLine(job, phase)}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {job.state === 'needs-user' && run.id === job.id && <Button small title="Show the page" icon="open-outline" onPress={() => clipEngine.show(true)} />}
        {(job.state === 'paused' || (job.state === 'needs-user' && run.id !== job.id)) && <Button small title="Continue" icon="play" onPress={() => clipEngine.resume(job.id)} />}
        {(job.state === 'running' || job.state === 'queued') && <Button small kind="secondary" title="Pause" icon="pause" onPress={() => clipEngine.pause(job.id)} />}
        {live && <Button small kind="ghost" title="Stop" icon="stop" onPress={() => clipEngine.cancel(job.id)} />}
        {job.key && <Button small kind="secondary" title="Open story" icon="book-outline" onPress={() => router.push({ pathname: '/story/[id]', params: { id: job.key! } })} />}
      </View>
    </Card>
  );
}

export default function ClipsScreen() {
  const c = useTheme();
  const jobs = useClipJobs();
  const order = { running: 0, 'needs-user': 1, queued: 2, paused: 3, done: 4, stopped: 5 } as const;
  const list = [...jobs].sort((a, b) => order[a.state] - order[b.state] || b.updatedAt - a.updatedAt);
  const finished = jobs.some((j) => j.state === 'done' || j.state === 'stopped');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Clipping' }} />
      {list.length === 0 ? (
        <Empty
          icon="cut-outline"
          title="Nothing is being clipped"
          message="Library → + → Clip a whole story: paste the address of a story’s first chapter and FicShelf clips the rest by itself while you read."
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <T muted size={13} style={{ lineHeight: 18 }}>
            FicShelf clips one chapter at a time at your pace (Settings → Clipping) while it’s open. It pauses when you leave the app and goes on when you
            come back. When a site wants you to log in or check you’re human, a banner asks you.
          </T>
          {list.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
          {finished && <Button kind="ghost" title="Clear finished" onPress={() => clipEngine.clearFinished()} />}
        </ScrollView>
      )}
    </View>
  );
}
