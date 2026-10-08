// Deep link: ficshelf://s/<id>/<chapter> opens the story (or the reader at a chapter). These are
// FanFiction.net's own /s/ paths, so the id is always an FFN story number.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { toKey } from '../../sources/keys';

export default function StoryDeepLink() {
  const { rest } = useLocalSearchParams<{ rest: string[] }>();
  const [id, chapter] = Array.isArray(rest) ? rest : [rest];
  if (!/^\d+$/.test(id ?? '')) return <Redirect href="/" />;
  const key = toKey('ffn', String(Number(id)));
  if (chapter && Number(chapter) > 1) return <Redirect href={{ pathname: '/read/[id]', params: { id: key, ch: String(Number(chapter)) } }} />;
  return <Redirect href={{ pathname: '/story/[id]', params: { id: key } }} />;
}
