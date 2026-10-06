import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { openStory, storyMenu } from '../features/actions';
import type { StorySummary } from '../ffn/types';
import { newChapterCount, storyProgress, useLibraryStory, type LibraryStory } from '../state/library';
import { useTheme } from '../theme';
import { formatNumber, relativeTime } from '../utils/format';
import { Cover } from './Cover';
import { Badge, ProgressBar, T } from './ui';

function StoryCardImpl({
  story,
  compact,
  showFandom = true,
  onPress,
  right,
}: {
  story: StorySummary | LibraryStory;
  compact?: boolean;
  showFandom?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const c = useTheme();
  const lib = useLibraryStory(story.id);
  const fresh = lib ? newChapterCount(lib) : 0;
  const progress = lib?.lastReadAt ? storyProgress(lib) : 0;
  const stats = [
    story.rating && `Rated ${story.rating}`,
    story.language,
    story.genres.length ? story.genres.join('/') : undefined,
  ].filter(Boolean);
  const numbers = [
    story.chapters > 1 ? `${story.chapters} ch` : '1 ch',
    `${formatNumber(story.words)} words`,
    story.reviews ? `${formatNumber(story.reviews)} reviews` : undefined,
    story.favs ? `${formatNumber(story.favs)} favs` : undefined,
    story.follows ? `${formatNumber(story.follows)} follows` : undefined,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress ?? (() => openStory(story.id))}
      onLongPress={() => storyMenu(story)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${story.title}${story.author ? ` by ${story.author.name}` : ''}`}
      accessibilityHint="Opens the story. Long press for more actions."
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
    >
      <View style={styles.top}>
        <Cover path={story.coverUrl} width={compact ? 44 : 54} height={compact ? 58 : 72} title={story.title} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <T size={16} weight="700" numberOfLines={2} style={{ flex: 1 }}>
              {story.title}
            </T>
            {fresh > 0 && <Badge label={`+${fresh}`} color={c.success} />}
            {lib?.downloaded && <Ionicons name="cloud-done-outline" size={16} color={c.textMuted} />}
          </View>
          {!!story.author && (
            <T muted size={13} numberOfLines={1} style={{ marginTop: 1 }}>
              by {story.author.name}
            </T>
          )}
          {showFandom && !!story.fandom && (
            <T size={12} numberOfLines={1} style={{ marginTop: 2, color: c.accent }}>
              {story.isCrossover ? '⇄ ' : ''}
              {story.fandom}
            </T>
          )}
        </View>
        {right}
      </View>
      {!compact && !!story.summary && (
        <T size={14} numberOfLines={4} style={{ marginTop: 8, lineHeight: 19 }}>
          {story.summary}
        </T>
      )}
      {!compact && !!story.characters && (
        <T muted size={12} numberOfLines={1} style={{ marginTop: 6 }}>
          {story.characters}
        </T>
      )}
      <View style={styles.meta}>
        <T faint size={12} numberOfLines={1} style={{ flex: 1 }}>
          {[...stats, ...numbers].join(' · ')}
        </T>
      </View>
      <View style={styles.footer}>
        {story.complete ? (
          <View style={[styles.status, { backgroundColor: c.success + '22' }]}>
            <T size={11} weight="700" style={{ color: c.success }}>
              COMPLETE
            </T>
          </View>
        ) : null}
        <T faint size={12}>
          {story.updated ? `Updated ${relativeTime(story.updated)}` : story.published ? `Published ${relativeTime(story.published)}` : ''}
        </T>
        {progress > 0 && (
          <View style={{ flex: 1, marginLeft: 8 }}>
            <ProgressBar value={progress} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const StoryCard = memo(StoryCardImpl);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  top: { flexDirection: 'row', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  meta: { flexDirection: 'row', marginTop: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  status: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
