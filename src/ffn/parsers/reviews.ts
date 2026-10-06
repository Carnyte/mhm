// /r/{storyId}/{chapter}/{page}/

import type { Review, ReviewPage } from '../types';
import {
  attr,
  idFromPath,
  imageUrl,
  ownText,
  parseHtml,
  parsePagination,
  sanitizeHtml,
  text,
  userFromLink,
  xutime,
} from './dom';
import { pageTitle } from './storyList';

export function parseReviewPage(html: string, storyId: number): ReviewPage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const table = content.querySelector('#gui_table1') ?? content;
  const reviews: Review[] = [];
  for (const td of table.querySelectorAll('tr > td')) {
    const body = td.querySelector('div');
    if (!body) continue;
    const userA = td.querySelectorAll('a').find((a) => /^\/u\/\d+/.test(attr(a, 'href') ?? ''));
    const small = td.querySelector('small');
    const chap = text(small).match(/chapter\s+(\d+)/i);
    const reviewer = userFromLink(userA);
    if (reviewer) reviewer.avatarUrl = imageUrl(td.querySelector('img.round36'));
    // Guests: the name is a bare text node before <small>.
    let guestName: string | undefined;
    if (!reviewer) {
      guestName = ownText(td).replace(/\s*\.?\s*$/, '').trim() || 'Guest';
    }
    const reportA = td.querySelectorAll('a').find((a) => /reviewid=\d+/.test(attr(a, 'href') ?? ''));
    reviews.push({
      reviewer,
      guestName,
      chapter: chap ? Number(chap[1]) : undefined,
      date: xutime(small?.querySelector('[data-xutime]')),
      html: sanitizeHtml(body.innerHTML),
      reviewId: idFromPath(attr(reportA, 'href'), /reviewid=(\d+)/),
    });
  }
  const chapSel = content.querySelector("select[name='chapter']");
  const chapters = chapSel ? chapSel.querySelectorAll('option').length - 1 : 1;
  return {
    storyId,
    storyTitle: pageTitle(root)?.replace(/^Reviews for\s*/i, ''),
    reviews,
    page: parsePagination(content, /\/r\/\d+\/\d+\/(\d+)\//),
    chapters: Math.max(chapters, 1),
  };
}
