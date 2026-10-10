// Pictures in imported chapters. They're saved as `<img src="ficshelf-img:<n>">` and shown from
// data: URIs swapped in when the page is built (the reader page is an HTML string and loads
// nothing from the device by itself). Under the Content-Security-Policy imported pages get, web
// pictures can't load at all, so they're taken out rather than left as broken boxes.

import { replaceImageRefs } from '../import/build';

export function withBookImages(html: string, images: Record<number, string> | undefined, opts: { webImages: boolean }): string {
  let out = html.includes('ficshelf-img:') ? replaceImageRefs(html, (n) => images?.[n]) : html;
  if (!opts.webImages) out = out.replace(/<img\b[^>]*?\ssrc="(?:https?:)?\/\/[^"]*"[^>]*>/gi, '');
  return out;
}
