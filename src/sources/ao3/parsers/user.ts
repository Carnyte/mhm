// A creator's works: /users/NAME/works or /users/NAME/pseuds/PSEUD/works. A works listing (with
// the same filter sidebar as tag pages) under the heading "16 Works by NAME".

import { parseListing, type Ao3Listing } from './listing';

export interface Ao3UserWorks extends Ao3Listing {
  /** The name in the heading ("eleventy7", or "pseud (user)"). */
  name?: string;
}

export function parseUserWorks(html: string): Ao3UserWorks {
  const listing = parseListing(html);
  return { ...listing, name: listing.title };
}
