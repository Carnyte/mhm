# Novelpia: research, the classifier denial, and the optional source phase

> Read before anything Novelpia; the approved route is Clip.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 6.7 Novelpia (2026-10-21 research) and other sites
global.novelpia.com is a Nuxt app without Cloudflare; robots.txt allows `/viewer`; metadata is in
`__NUXT_DATA__`; chapter text comes from `api-global.novelpia.com` with a one-time `_t` ticket after
a server-side entitlement check, then CloudFront-signed content. Extracting the ticket was **denied by
the auto-mode classifier ("Third-Party Attack")**; no chapter text was pulled. The approved route is
"Clip this page" (`docs/clipping/p-clip.md` §4); a full Novelpia source is optional (§10). Details
(fields, endpoints, error codes, sample ids) are in `docs/clipping/p-clip.md` §4 "Novelpia findings".

---

### 10.11 Novelpia and the classifier denial (2026-10-21)
- The chapter text needs a one-time `_t` ticket from an entitlement-checked API; extracting it was
  denied ("Third-Party Attack"); the page showed "Free" while `flag_free` was `0`. → Never handle a
  site's tickets or tokens outside its own page; don't trust one flag over what the site shows; the
  approved route is Clip (rendered DOM, one tap per chapter).
- iPhone Safari saves `.webarchive` or PDF (both rejected); raw HTML of JS readers has no text. → Clip takes the *rendered* DOM.

---

## 10. P-NOVELPIA: optional Novelpia source

```yaml
id: P-NOVELPIA
title: Optional Novelpia source
status: optional
order: 7
depends_on: [P-CLIP]
native_rebuild: no
approved_by_user: >-
  No. Offered on 2026-10-21 as option 1 (a full source); the user chose Clip ("option two") and
  asked for any future website.
gate: (1) read Novelpia Global's terms of service; (2) the user's explicit go-ahead; (3) a short live test with the user's OK
```

### why
For heavy Novelpia reading: browsing, story pages, new-chapter alerts. Clip is one tap per chapter
(a 111-chapter story means 111 clips).

### scope
- [ ] NP-1 Read Novelpia Global's terms; summarise for the user; get a go-ahead.
- [ ] NP-2 Add a source id (`'np'` or `'novelpia'`) to `SOURCE_IDS` in `src/sources/keys.ts` with
      key tests; fill every `Record<SourceId, …>` table (`SOURCE_NAMES`, `REMOTE_ID`, palette in
      `src/theme/index.ts`, `SourceChips.LABELS`, `DEFAULT_SOURCES` (off), `UIS`, registry, `LINK_ORDER`
      before `ffn`); follow the "add a new Source" checklist in `docs/sources_common.md` §6.6.
- [ ] NP-3 `src/sources/novelpia/{urls,api,map,adapter,ui}.ts`; metadata from `__NUXT_DATA__`
      (synthetic decoder) or public `/v1/novel`, `/v1/novel/episode/list` (params unverified) on
      `api-global.novelpia.com`.
- [ ] NP-4 A viewer WebView host (new, modelled on `src/net/BridgeHost.tsx`): text comes only from
      Novelpia's own viewer rendered in a WebView and captured with P-CLIP's capture script; one
      chapter per user action ("Read" / "Save chapter").
- [ ] NP-5 Locks: lock state from what the viewer showed (text, or a paywall / login notice), not
      `flag_free`; locked → **Open on Novelpia**; codes `0003` / `0008` (`NOVEL_ERROR`) → "Not available here".
- [ ] NP-6 Downloads, if offered at all: user-started, sequential, spaced, stoppable; default:
      chapters saved only as read.

### files
`src/sources/novelpia/*`, a new viewer host component, `src/sources/keys.ts` and the
`Record<SourceId,…>` tables, `src/net/httpCore.ts` `POLICIES` for `api-global.novelpia.com` /
`global.novelpia.com`.

### data / API details
See P-CLIP "Novelpia findings" (fields, endpoints, error codes, sample ids). Other endpoints seen in
the public JS (not called): `/v1/novel`, `/v1/novel/count`, `/v1/novel/list`, `/v1/novel/episode/list`,
`/v1/novel/episode/cursor-list`, `/v1/novel/episode/total-count`, `/v1/novel/episode/all-count`,
`/v1/novel/episode/first?novel_no=`, `/v1/novel/episode/next?novel_no=&episode_no=&sort_no=`,
`/v1/novel/episode/prev?…`, `/v1/novel/episode/metadata?novel_no=&episode_no=`,
`/v1/novel/episode/image?_t=`, `/v1/novel/episode/good` (POST), `/v1/login/me`, `/v1/member/login`,
`/v1/novel-rank`, `/v1/curation`.

### policies
Free and unlocked chapters only. **Never extract, store or replay the `_t` ticket, `signed_key` or
CloudFront signed cookies / URLs; never call `/v1/novel/episode/content` from app code.**

### tests
- [ ] NP-T1 Synthetic `__NUXT_DATA__` decoder.
- [ ] NP-T2 **No request URL contains `_t=` or `/episode/content`, and no stored value contains `signed_key`.**
- [ ] NP-T3 Lock UI.

### acceptance
With the user, after the gate.

### install_notes
No prebuild. Template T1.

### risks
Terms unknown; paywall sensitivity (the classifier already refused ticket handling once); Nuxt
data shape may change.

### open_questions
| id | question | default |
|---|---|---|
| OQ-NP-1 | Build a full Novelpia source? | Only after reading the terms and with the user's go-ahead; Clip covers it until then. **Unanswered** |
