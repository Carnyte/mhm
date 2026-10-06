import { WORDS_PER_MINUTE } from '../ffn/constants';

export function formatNumber(n: number | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function formatFull(n: number | undefined): string {
  return (n ?? 0).toLocaleString('en-US');
}

/** Unix seconds → "3h ago", "Mar 4", "Mar 4, 2019". */
export function relativeTime(sec: number | undefined, now = Date.now()): string {
  if (!sec) return '';
  const diff = now / 1000 - sec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(sec * 1000);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function formatDate(sec: number | undefined): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function relativeMs(ms: number | undefined): string {
  return ms ? relativeTime(ms / 1000) : 'never';
}

export function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function pluralize(n: number, word: string, plural = word + 's'): string {
  return `${formatFull(n)} ${n === 1 ? word : plural}`;
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.';
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Strips tags from HTML, for TTS and excerpts. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}
