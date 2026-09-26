# PROJECT SYNAPSE

Print-and-play deductive murder mysteries for **1–6 detectives**, no facilitator required — and,
eventually, an engine that generates them.

**Two cases are complete and playable.**

| | Case | Tier | Time | Sheets | The experiment |
|---|---|---|---|---|---|
| **01** | [The Halvorsen Bequest](#part-one--how-to-play-case-01) | MEDIUM | 90–120 min | 33 | Shared information. *Is deduction from documents fun?* |
| **02** | [The Ravensgate Interlock](#part-one-b--case-02-the-ravensgate-interlock) | HARD | 120–160 min | 53 | Split information. *Does asymmetry between players add anything?* |

**Play Case 01 first.** It is the control condition, and Case 02 assumes you know how it works.

## Two ways to play

| | How | Best for |
|---|---|---|
| **Printable** | Print the files in `cases/<case>/print/`, stuff the envelopes, play at a table. Full instructions below. | Four people leaning over the same page |
| **Digital** | Open the web app (`index.html`, hosted on GitHub Pages). Play **solo**, pick any case or a random one, and post your time to the leaderboard. | No printer, no envelopes, instant setup |

Both use the same documents. The web app reads the print HTML files directly, so any edit to a
case's print files shows up in the digital version automatically. See
[Part Three](#part-three---the-digital-version) for how it works and how to put it live.

---

# PART ONE — HOW TO PLAY CASE 01

## What you're getting into

A conservator is found dead in a refrigerated art vault. He had a heart condition, a written
exemption barring him from that room, and he went in anyway without his monitor. The Medical
Examiner recorded **accidental death**. The file closed in eleven days.

Six weeks later the insurers refused the claim and the file was reopened. You are the review team.

There is no murder on the table when you sit down. Finding out whether there was one is the game.

## Requirements

Everything you need to run Level 01. Nothing here is exotic; the only thing people don't already
have is envelopes.

### People and time

| | |
|---|---|
| **Detectives** | 1–6. Best at **4**. |
| **Facilitator** | **Not required.** Everything is self-administering — sealed envelopes do the job a games master would otherwise do. |
| **One non-player** | Strongly wanted, for printing only. Files 03 and 04 are spoilers; whoever prints them can't play. If everyone wants to play, print those two face-down and sleeve them unread. |
| **Preparation** | 20–30 min — printing, cutting, stuffing 15 envelopes. Once only; the case is reusable with a fresh Resolution Sheet. |
| **Play** | 90–120 min. Add 15 min for the reveal and scoring. |
| **Age / reading level** | ~14+. No gore, no violence on the page. The barrier is document density, not content. |

### Physical materials

| Item | Quantity | Notes |
|---|---|---|
| **A4 paper** | **33 sheets** minimum · 36 for 2–3 players · 40 for 4–6 | Full breakdown in [`print/PRINT-GUIDE.md`](cases/SYN-MVP-001/print/PRINT-GUIDE.md). A 26-sheet minimum-ink variant is documented there. |
| **A4 printer** | 1 | **Mono is fine** — the entire case is monochrome by design. Must be able to print background graphics. |
| **Envelopes** | **15** | 11 numbered `01`–`11`, 3 marked `RECONSIDER`, 1 marked `S-1`. DL or C5. Fold-and-staple works if you have none. |
| **Pencils** | 2+ | Not pens. People revise the Resolution Sheet. |
| **Calculator** | 1 (a phone) | Exactly one division decides this case. See *Arithmetic* below. |
| **Table** | Room for **10 loose A4 pages** side by side, plus elbows | Roughly 120 × 80 cm. This is a real constraint — the case is built around two documents being pointed at simultaneously. |

### Software

| | |
|---|---|
| **Chrome or Edge** | Required, to print. The layout uses `@page` A4 sizing that Firefox and Safari render inconsistently. |
| **Node.js 14+** | **Optional.** Only needed to run `tools/validate.js`. Not needed to play. |
| **Anything else** | No. For the printed version: no app, no website, no account, no dice, no board. |

### Print settings — the two that actually matter

Set these in the browser print dialogue or the case will not look or work right:

- **Headers and footers → OFF.** Otherwise every page prints a URL and today's date across the top,
  and the documents stop reading as real records.
- **Background graphics → ON.** Off, and the shaded boxes vanish — including the one on B-1 page 2
  that carries the cooling formula the whole case turns on.

Also: A4, **Default** margins, **100%** scale (not "Fit to page"), greyscale.

### Reading and numeracy load

Be honest with your table about this before you start — it's a reading game.

| | |
|---|---|
| **Player-facing text** | ~6,900 words across all documents. ~35 min of straight reading, spread over the session and split between people. |
| **Densest page** | D-1 (facility logs) — 9pt monospace tables. If anyone at the table struggles with small type, print pages 8–9 of file 01 at 125% scale on separate sheets. |
| **Arithmetic** | **One division.** `5.0 ÷ 1.94 = 2.6`. The autopsy's Appendix M supplies the multiplier in a lookup table — nobody has to derive anything. If arithmetic is unwelcome at your table, a phone calculator removes the entire obstacle without touching the puzzle. |
| **Language** | UK English, formal register, police and conservation vocabulary. Every technical term is explained in the document that uses it. |

### If you have no printer

Playable from screens, with one compromise. Open file `01` in a shared tab or a projector; put files
`03` and `04` on **one person's device only** and have them reveal a single page when it's bought.
That person becomes a de-facto facilitator and cannot fully play.

It works. Paper is better. This case wants four people leaning over the same page arguing about a
number written in the wrong room.

### What you do NOT need

No board, no dice, no cards, no tokens, no timer, no app, no internet during play, no prior
knowledge of the source specification, and no experience with deduction games. Case 01 teaches its
own mechanic in the first twenty minutes — Ferraro exists for exactly that.

## 1 · Print it

Four files, in `cases/SYN-MVP-001/print/`. Open each in Chrome or Edge and print with the settings
listed under **Requirements** above — headers and footers **off**, background graphics **on**.

| Print | File | Pages | What to do with it |
|---|---|---|---|
| 1 | `01-base-dossier.html` | 10 | The case file. **Everyone reads all of it.** Leave it loose on the table. |
| 2 | `02-play-materials.html` | 4 | Briefing, authority menu, Resolution Sheet. One set per table. |
| 3 | `03-action-results.html` | 11 | **Separate the pages without reading them.** One per envelope, numbered 01–11. |
| 4 | `04-envelope-s1.html` | 8 | Pages 1–3 seal *separately* (the three Reconsider inserts). Pages 4–8 seal *together* (Envelope S-1). |

Total 33 A4 sheets. Keep 3 and 4 single-sided so they separate cleanly. **Full page-by-page
breakdown, copy counts, spare-page advice and an assembly checklist are in
[`print/PRINT-GUIDE.md`](cases/SYN-MVP-001/print/PRINT-GUIDE.md).**

> **If you want to play this yourself, get someone else to do the printing.** Prints 3 and 4 are
> spoilers. Prints 1 and 2 are not — you can safely handle those.

**No printer?** Play from screens: open print 1 in one tab for everyone to read, and have one
person hold prints 3 and 4 unopened in other tabs, revealing only what's bought. It works. Paper
is better — this case wants four people leaning over the same page arguing about a number.

## 2 · Set up (5 minutes)

1. Spread the **base dossier** (A-1, B-1, C-1…C-4, D-1, E-1) face up in the middle of the table.
2. Put the **authority menu** where everyone can see it, and the **Resolution Sheet** in front of
   whoever writes fastest.
3. Stack the eleven sealed **authority envelopes** in a pile, numbers up.
4. Put **Envelope S-1** somewhere nobody's hands wander to. Put the three **Reconsider** envelopes
   next to it, unopened.
5. Read the briefing page aloud. Then start.

## 3 · The rules, entire

**The documents don't lie. People might.** Every untruth in the transcripts can be caught by a
document in the file. If a statement and a log disagree, the log is right.

**Everyone reads everything.** There are no secret roles and no hidden envelopes between players.
Case 01 is a shared-information game — the tension is in what you *spend*, not what you *hide*.

**You have a fixed number of Authorities.** They do not come back.

| Detectives | Authorities |
|---|---|
| 1–2 | 6 |
| 3–4 | 7 |
| 5–6 | 8 |

To spend one: say the number, agree it as a table, cross it off the menu, open that envelope.
Eleven are available. **Not all of them return anything useful.** Choosing well *is* the game — and
every one of them was suggested by something already sitting in the file. Before you spend, make
someone say out loud what in the closed file made them want it. If nobody can answer, don't buy it.

**Write your working down as you go.** The Case Resolution Sheet has six steps. Fill each in, with
document references, *as you establish it*. Anything not written before the accusation scores
nothing.

**You get two wrong accusations.** Each costs 10 points and returns a **Reconsider** envelope
telling you what your theory failed to account for — not the answer, the gap. Your **third
accusation is final** and is scored as it stands.

**When you're done:** complete the sheet, sign the accusation, *then* open Envelope S-1. One person
reads it aloud, in order, without skipping. Score afterwards.

## 4 · Playing solo

Same case, 6 Authorities, plus one change — the dossier opens in three phases, because handing one
person everything at once removes the only pacing this game has.

| Phase | Read | To move on |
|---|---|---|
| 1 | A-1, B-1 | Write down your working time of death, and which suspects are plausible. |
| 2 | C-1…C-4, D-1 | Revise both in writing. Authorities open now. |
| 3 | E-1 and everything remaining | — |

It's an honour system. It costs you nothing to cheat and it costs you the entire experience.

> **Optional hard mode (untested):** at the end of Phase 1, name in writing the *two* suspects you
> are keeping. In Phase 2 you may open only those two transcripts. Opening a third costs you an
> Authority. This turns the phase gate into a real commitment — if it works it goes into the
> permanent rules; tell me if it doesn't.

## 5 · After you play — the three things I need to know

This case exists to answer three questions. Everything else is decoration.

1. **How long did the file's own time of death go unquestioned at your table?** Note the minute.
   That number *is* the case.
2. **Was the moment it broke an "aha" or a shrug?** Watch faces, not scores. If nobody reacted, the
   case has a correct spine and no soul, and it gets rebuilt rather than polished.
3. **Did the Authority limit ever hurt?** If nobody agonised over a choice, the budget is too
   generous — drop everyone to 5 and run it again.

Secondary: time to your first elimination (should be under 20 minutes — Ferraro exists for that);
whether anyone accused Kovaleski early and how that felt; whether the arithmetic on B-1 was a
pleasure or a chore.

---

# PART ONE-B — CASE 02: "THE RAVENSGATE INTERLOCK"

**HARD tier. 1–6 detectives, 120–160 minutes, 53 sheets, 17 envelopes.**
Full print instructions: [`cases/SYN-MVP-002/print/PRINT-GUIDE.md`](cases/SYN-MVP-002/print/PRINT-GUIDE.md)

> A storm cuts the road to a hydroelectric dam and seals six people in with each other. By dawn two
> are dead — a manager electrocuted at a switchgear cabinet, and a control engineer drowned in the
> intake gallery. Her credential card opened his cabinet and closed the circuit that killed him.
> The police found murder–suicide and closed the file in nineteen days.
>
> **Case 01 opened with no crime and found one. Case 02 opens with a crime already solved and has
> to take it apart.**

## What's different

Play Case 01 first. Case 02 assumes you know how Authorities work, and it changes exactly one thing.

**The file is split.** A public **Case Board** sits in the middle of the table. Everything else is
in five **Specialist Files** — Control, Hydrology, Mechanical, Security, Regulator — and each
detective holds one. You may not read another detective's file.

**The Case Conference.** Three Sessions. In each, every detective may **table** one document from
their file: read it aloud, and it becomes public forever. At any time anyone may **query** — name a
subject or a time, and everyone must say truthfully whether their file holds anything on it,
without saying what. Queries are free; tabling costs a slot. After Session 3 all files open.

Resolution Sheet steps **score double** if established on the Board before Session 3 ends.

Nobody is lying and there are no hidden roles. Everyone wants the same answer. The answer is just in
five pieces, and the pieces don't know about each other.

**Authorities** are unchanged in shape and tightened by one: **5** for 1–2 detectives, **6** for
3–4, **7** for 5–6, against a deck of **12**. Four of the twelve genuinely return nothing.

**Requirements** are the Case 01 list with three changes: **53 sheets**, **17 envelopes**, and
**3+ players to use the Conference at all** (solo and 2-player have their own modes on the
Resolution Sheet). Reading load is 11,163 words — but split five ways that's ~11 minutes each in
Session 1, which is why the split exists.

## Why Case 02 exists

Case 01 answered *"is deduction from documents fun?"* Case 02 answers the question the source
specification is actually built around and which Case 01 deliberately dodged: **does information
asymmetry between players add anything, or does it just slow the reading down?**

Case 01 is the control condition. So Case 02 adds exactly **one** new mechanic and leaves the rest
alone — change two things and the playtest teaches you nothing.

### The three things to report back

1. **Did anyone hold a file and stay quiet?** That's the failure mode. Count how often the Query
   rule actually gets used. If it's never, the mechanic isn't working and the room is just taking
   turns reading.
2. **How many Sessions passed before the Hydrology file was tabled?** The keystone lives in one
   file. The Board's referral note points straight at it. If the group still stalls, asymmetry is a
   bottleneck rather than a texture — and that is a finding against §8 of the source spec.
3. **Run both cases with the same group and ask which room was louder.** That comparison is the
   whole experiment.

# PART TWO — WHAT'S IN THE REPOSITORY

```
cases/SYN-MVP-001/     CASE 01 · "The Halvorsen Bequest"  · MEDIUM · shared information
  ledger.json        Versioned single source of truth. Machine-readable ground truth,
                     the DAG, the action deck, the full timeline.        ⚠ SPOILERS
  case-bible.md      The same truth for humans. Design intent, solve path,
                     playtest watch-list.                                 ⚠ SPOILERS
  print/
    PRINT-GUIDE.md   Which pages, how many copies, printer settings, assembly checklist.
    dossier.css      Shared print stylesheet, A4.
    01-base-dossier.html    A-1, B-1, C-1…C-4, D-1, E-1     — safe to read
    02-play-materials.html  briefing, menu, Resolution Sheet — safe to read
    03-action-results.html  the 11 authority results         ⚠ SPOILERS
    04-envelope-s1.html     Reconsider inserts + Envelope S-1 ⚠ SPOILERS
cases/SYN-MVP-002/     CASE 02 · "The Ravensgate Interlock" · HARD · asymmetric
  ledger.json        As above, plus the Case Conference rules and file allocation.  SPOILERS
  case-bible.md      Design intent, solve path, the asymmetry experiment.           SPOILERS
  print/
    PRINT-GUIDE.md   Page-by-page, bundle boundaries, 53 sheets, 17 envelopes.
    01-case-board.html      public spine, A-0/A-1/A-2/B-1/B-2/D-1  — safe to read
    02-specialist-files.html  five bundles, F-1 to F-5             — safe to read
    03-play-materials.html  briefing, Conference rules, menu, CRS  — safe to read
    04-action-results.html  the 12 authority results                SPOILERS
    05-envelope-s1.html     4 Reconsider inserts + Envelope S-1     SPOILERS
  index.json         Case list for the web app. Generated: node tools/build-catalog.js
  digital.json       (in each case folder) Wiring for the web app: which print page is
                     which document, budgets, accusations, reveal steps, scoring.  SPOILERS
index.html           The digital version. Entry point for GitHub Pages.
app/                 Web app: app.css, paper.css (on-screen dossier look), js/ modules,
                     config.js (global leaderboard settings).
sw.js, manifest.webmanifest   Offline support and install-to-home-screen.
tools/
  validate.js        Deterministic case validator. Ten checks, no model judgment.
  serve.js           Zero-dependency local server for playing/testing the web app.
  build-catalog.js   Validates every digital.json and rebuilds cases/index.json.
  leaderboard.sql    One-time Supabase setup for a global leaderboard.
docs/
  DELTAS-FROM-SPEC-V6.md   Every divergence from the source specification,
                           traced to the finding that caused it.
```

# PART THREE - THE DIGITAL VERSION

A static web app with no build step. It runs on GitHub Pages as-is. The digital version is
**solo**: one detective per device. (The printed kits still work for a table of up to six.)

## What the player gets

- **Case catalog:** search, filter by difficulty and status (new / in progress / solved), and a
  **Random case** button that prefers cases you haven't solved.
- **Phased release** (on by default): the file opens in stages, and each stage unlocks only after
  you write a hypothesis.
- **The desk:** a wooden detective's desk. Documents are manila folders (a red clip marks new
  ones), later phases sit in taped-up bundles, and Authorities are a tray of wax-sealed envelopes.
  A pinned memo holds the phase gate. The clipboard (Resolution Sheet) and notebook take
  handwritten-style entries and dock beside the document you're reading. There's a desk
  calculator, a service bell for breakthroughs, a rubber-stamp Accuse button, and quiet
  synthesized sound effects (mutable).
- **Reading:** click a folder to pick it up. Compare two documents side by side, zoom, highlight,
  and quote into the notebook. Esc goes back to the desk.
- **Authorities:** spend-to-open sealed results, with the budget enforced.
- **Resolution Sheet:** a live sheet with a citation picker. It warns about uncited steps and
  locks at the final accusation.
- **Accusations:** a wrong one opens its Reconsider envelope. The third accusation is final.
- **Envelope S-1:** a step-by-step reveal shown beside your own sheet, with honest self-scoring.
- **Score:** calculated automatically, with a game clock and Breakthrough log.
- **Leaderboard:** post a name or username with your score and time. Names are checked for swear
  words, and only a first attempt at a case can be posted.
- **Shareable results:** a link that opens a result card for anyone (`#/r/...`, no server
  needed), a generated image, and the phone's share sheet where available.

Progress saves automatically in the browser (`localStorage`).

## Run it locally

The app loads the print files with `fetch()`, which browsers block on `file://`, so serve it:

```bash
node tools/serve.js          # then open http://localhost:8080
```

## Put it live on GitHub Pages (account: jenilmistryhq)

1. Create a new public repository on GitHub, for example `synapse`, under **jenilmistryhq**.
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Project Synapse: printable and digital"
   git branch -M main
   git remote add origin https://github.com/jenilmistryhq/synapse.git
   git push -u origin main
   ```
3. On GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch**,
   branch **main**, folder **/ (root)**. Save.
4. After a minute the game is live at **https://jenilmistryhq.github.io/synapse/**.

All paths are relative, so any repository name works. The `.nojekyll` file stops GitHub from
running Jekyll over the files.

## Make the leaderboard global (optional, free)

Out of the box, each browser keeps its own leaderboard. To share one leaderboard between all
players you need somewhere to store scores, and GitHub Pages cannot. Supabase's free tier works
well for this:

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of [`tools/leaderboard.sql`](tools/leaderboard.sql), and
   run it. It creates the `scores` table, allows the public to read scores and add new ones (but
   never edit or delete), and adds a database-side swear filter as a backstop.
3. In **Settings > API**, copy the **Project URL** and the **anon public** key into
   [`app/config.js`](app/config.js). Commit and push.

The anon key is meant to be public; the table's row-level security is what protects it.

**Honest limits.** Scores are calculated in the player's browser and part of the score is
self-assessed during the S-1 reveal, so a determined person could post a fake score. The
leaderboard guards against casual abuse (a first-attempt rule, a one-minute minimum, the name
filter, range checks in the database), not against someone who sets out to cheat. Moderate by
deleting rows in the Supabase table editor.

## Security

Reviewed 2026-09-26. What protects the site:

| Layer | Protection |
|---|---|
| Case content | Every print page is sanitized before display: scripts, iframes, SVG, forms, `on*` handlers, `javascript:`/`data:` links and CSS `url()` are stripped. A bad edit to any case file cannot run code. |
| Browser | A Content Security Policy (`index.html`) allows scripts only from this site. There is no `eval` anywhere, no plugins and no form posts, and network calls go only to this site, Google Fonts and `*.supabase.co`. |
| Rendering | All player and leaderboard text is inserted as text, never HTML. Rows from the server are validated before display. |
| Database | The public role can SELECT and INSERT only, into the game's columns. UPDATE, DELETE and TRUNCATE are denied, the server sets `created_at`, and every value is range-checked. A server-side name filter runs, plus a rate limit of 10 posts per network per hour and 300 per 10 minutes globally. Tested against Postgres 16. |
| Keys | Only the public anon key belongs in `app/config.js`. The app refuses to use a secret or service_role key. |
| Local server | `tools/serve.js` listens on 127.0.0.1 only and cannot serve files outside the project folder. |

**Accepted risks** (inherent to a static site, or low impact):

- **Scores can be faked** by a determined player, because scoring runs in the browser and is partly self-assessed. The database limits the damage (range checks, rate limits). Moderate by deleting rows in Supabase.
- **Shared result links are self-reported.** The result page says so.
- **Spoilers are public.** Anyone can open the sealed print files or a `digital.json`.
- **Anyone can post under any name**, for example yours. There are no accounts.
- **Clickjacking headers** can't be set on GitHub Pages. The only framed action would be posting a score.
- **Shared origin.** Every repository on `jenilmistryhq.github.io` shares one browser origin, so your other Pages projects could read this game's saved progress. A custom domain avoids this.
- **Google Fonts** sees each visitor's IP address. Self-host the fonts in `app/` if that matters to you (GDPR).

Also turn on two-factor authentication for the GitHub and Supabase accounts: whoever controls
those controls the site.

## Adding a case (the plan is 50+)

1. Build the print files as usual (each page is a `<div class="doc">`).
2. Add `cases/<id>/digital.json`, copying an existing one. Page numbers are **zero-based
   indexes** of the `.doc` elements in each print file. The Authority menu and Resolution Sheet
   questions are read from the printed pages. `tier` is one of Easy, Medium, Hard, Expert.
   `order` sets its place in the catalog.
3. Run **`node tools/build-catalog.js`**. It checks every page reference, every phase and
   accusation option, and that exactly one accusation is correct. Then it rebuilds
   `cases/index.json`, which is the list the site shows. It refuses to write the list if
   anything is broken.
4. S-1 is split into reveal steps at every `<h2>` and at the verdict box. `reveal.steps` must
   have one entry per section (the browser console warns if the counts differ).

5. Run **`npm run pdf`** (after `npm install` once) to build the print kit PDFs into
   `cases/<id>/print/pdf/`. Re-run it whenever a print file changes.

No code changes are needed to add a case.

## The print kit PDFs

`tools/build-pdfs.js` prints every case with your local Chrome or Edge into exact A4 PDFs:
one per print file, plus a **player pack** (everything spoiler-free), a **sealed pack** (the
printer-only files) and an **envelope label sheet**. Players download these from each case's
Print & play page instead of fighting browser print settings.

Documents that run slightly over one A4 page are scaled down to fit (never below 80%), so every
Authority slip and Reconsider insert is exactly one page and the page-number-to-envelope rule
still holds. Genuinely long documents (for example the Ravensgate site plan) keep full size and
run onto a second page. Note: the original HTML print files overflow in the same places when
printed straight from the browser; the PDFs are the fixed version.

PDFs add about 2.5 MB per case to the repository (roughly 125 MB for 50 cases), which is well
within GitHub Pages limits.

## Validating a case

```bash
node tools/validate.js cases/SYN-MVP-001/ledger.json
```

Checks C1–C5 are the source spec's five. C6–C10 are ours, each added because a review found a hole:

| | Check | Catches |
|---|---|---|
| C6 | **Anti-sweep** | elimination edges with no prerequisites — the dominant strategy that lets you win by collecting clearing cards instead of solving anything |
| C7 | **Keystone** | a central insight that turns out to be bypassable by a cheaper route |
| C8 | **Signposting** | an action-gated document that nothing in the base dossier points at |
| C9 | **Action solvency** | a minimum winning set that doesn't fit the smallest table's budget |
| C10 | **Tier conformance** | undeclared drift from the difficulty band |

Both C6 and C7 have already earned their keep on this case. **C7 caught the life-safety log sitting
in the base dossier**, where a single timestamp handed players the true time of death and made the
entire central puzzle skippable for free. Moving it behind an Authority fixed it — and made the case
better, because the reframe is now what converts an accident into a homicide.

Case 01 currently reports **PASS, one declared deviation**: measured requires-chain depth 10 against
the spec's MEDIUM band of 2. That's a finding, not a bug — depth 2 describes a case with no reframe
in it. See finding #3 in the deltas.

## Build order

- [x] **1 · Case skeleton** — ledger, ground truth, validator
- [x] **2 · Player documents** — A-1, B-1, C-1…C-4, D-1, E-1
- [x] **3 · Play layer** — briefing, Authority menu, Case Resolution Sheet
- [x] **4 · Reveal** — Envelope S-1 script, scoring, Reconsider inserts
- [x] **5 · Print** — A4 CSS compilation
- [ ] **6 · Playtest** — four people, one table, the three questions above

**Only after step 7 says yes: the generator.**

The source specification is seventeen pages of architecture for mass-producing cases whose fun has
never once been observed. The riskiest assumption in this whole project is *"this is enjoyable to
play"* — and it costs one evening and thirty-three sheets of paper to find out. That's what Case 01
is for.
