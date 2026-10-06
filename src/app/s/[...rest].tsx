// Deep link: ficshelf://s/<id>/<chapter> opens the story (or the reader at a chapter).

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function StoryDeepLink() {
  const { rest } = useLocalSearchParams<{ rest: string[] }>();
  const [id, chapter] = Array.isArray(rest) ? rest : [rest];
  if (chapter && Number(chapter) > 1) return <Redirect href={{ pathname: '/read/[id]', params: { id: String(Number(id)), ch: String(Number(chapter)) } }} />;
  return <Redirect href={{ pathname: '/story/[id]', params: { id: String(Number(id)) } }} />;
}
