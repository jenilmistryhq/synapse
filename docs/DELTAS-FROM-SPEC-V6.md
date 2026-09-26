# Deltas from `synapse_case_engine_specification_v6.pdf`

Every divergence, traced to the finding that caused it. Schema fork: **6.1-fork**.

---

### 1. `eliminates` edges must carry prerequisites

**Spec behaviour.** §4.3 Check 2 requires every non-culprit to carry an evidence-backed
elimination. §3.2's worked example gives its elimination edge `"requires": []`.

**The failure.** For every innocent there is exactly one document that clears them, reachable
at step zero. Optimal play is: collect the clearing cards; the suspect without one is the
killer. You never touch cause, mechanism, opportunity, or the alibi break. Leap Detection
(Check 4) can never fire on an elimination, because there is nothing to skip.

**It gets worse with difficulty.** More red herrings means more clearing cards, so the
culprit's silhouette in negative space gets *sharper* at higher tiers. EXPERT (7–8 suspects)
hands you six or seven clearing cards. The spec's tier ladder makes its own dominant strategy
stronger.

**Our rule.** Non-empty `requires` on every elimination edge, with exactly one exception per
case: a declared `elimination_type: "single_free"` tutorial elimination, so players learn the
mechanic and bank an early win. Enforced by validator check **C6**.

---

### 2. New edge type — `eliminates_by_conjunction`

At least one innocent per case must have **no single clearing card.** Two or more documents
must be held together before they mean anything.

In SYN-MVP-001 that is Pryce: his NFC scans put him on Level D at 21:44 and 22:02; the
discharge fired at 21:58 from a corridor panel two floors up; the only two freight-elevator
cycles that evening both belong to Marchetti. Any one of those three clears nobody.

---

### 3. Tier bands cannot express a reframe — and the five dimensions do not co-vary

**Spec behaviour.** §10 bands MEDIUM at max requires-chain depth **2**.

**The problem.** Depth 2 means: establish two facts, then accuse. That is a form to fill in,
not a mystery. Our MEDIUM case measures **depth 10** — the keystone alone sits four inferences
deep before any suspect is touched.

Meanwhile it sits comfortably inside the MEDIUM band on suspects (4), base-dossier nodes (9),
red herrings (2), and cross-suspect edges (1). **A single tier label cannot bound five
dimensions that move independently.** Volume and depth are different axes, and §10 conflates
them: it scales difficulty mostly by *content volume*, which produces bookkeeping, not deduction.

**Our rule.** Tier bands are advisory per-dimension. Deviations must be **declared**
(`tier_deviations_accepted`) rather than silently tolerated — the validator downgrades a
declared deviation to a warning and hard-fails an undeclared one.

---

### 4. Tier counts measure the base dossier only

Action-gated evidence is *earned*, not handed over, so counting it against the tier band
double-charges the case. SYN-MVP-001: **9 base nodes** (inside MEDIUM's 7–9) + **5 gated** = 14 total.

---

### 5. Investigation Clock — the missing loop

**The gap.** The spec is 17 pages of generation architecture and roughly two of gameplay.
Players read documents and talk. There is no action economy, no scarcity, no cost to any
decision, no reason to withhold anything. Every piece of information is free and eventually
shared. That is a puzzle with a distribution scheme, not a game — §8's asymmetry gives players
a reason to *talk*, never a decision to *make*.

**Our rule.** A finite, non-regenerating pool of investigative actions. 6 for 1–2 detectives,
7 for 3–4, 8 for 5–6. Each buys one document. The final accusation is free.

What one mechanic fixes at once:

- Creates the decision the design did not have.
- Kills the elimination sweep economically as well as structurally — sweeping costs the actions
  you needed for the mechanism.
- Makes §8's asymmetry load-bearing: your envelope tells you which action is worth buying.
- Gives §11.2 scoring real texture — a clean solve in four actions beats a brute-force in ten.
- Costs almost nothing to generate: an `unlock_action` field on nodes Stage 5 already partitions.

---

### 6. Every gated node must be signposted

No action may be a blind guess. Something in the **base dossier** must make each action the
obvious next question:

| Action | Signpost, visible for free |
|---|---|
| ACT-11 life-safety event log | the status page prints "discrete events logged this period: **2**" |
| ACT-01 Level D door log | the B2 log shows two freight-elevator cycles with **no matching badge event** |
| ACT-08 dinner canvass | her statement claims 22:15; nothing in the base dossier tests it |
| ACT-06 financials | the victim's file is named `HALVORSEN_DISCREPANCY_v4.docx` |
| ACT-03 raw NFC data | the handwritten round log and the emergency call time disagree |

Enforced by validator check **C8**. This is the spec's own "never create puzzles that depend
on arbitrary guessing," applied to the action economy.

---

### 7. `reads_as` — separating the document from the deduction

**Spec behaviour.** §3.2's `description` fields contain the deduction pre-solved:
*"ALPR timestamp shows Thorne passing at 22:40 — mathematically incompatible with his stated
departure time at legal speeds."*

**The failure.** Agent B reading that does not infer anything; it transcribes. The real game
requires that sentence to survive being split across three documents, with the deduction
living in the gap between them. Since Stage 4 runs **before** Stage 6 compiles those documents,
**every solvability guarantee in the spec is a guarantee about a JSON file.** §6 says so outright:
the compilation gate is *"a version-equality check, not a content diff."*

**Our rule.** `reads_as` states what the document literally prints. The deduction it licenses
lives only in the edge. When we build the generator (MVP-1), Stage 4 moves *after* plain-text
document rendering — Agent B solves from the rendered pages, not from the graph.

---

### 8. Wrong-accusation feedback must not pay for itself

**Spec behaviour.** §11.2: wrong accusation **−5**; each red herring eliminated with evidence
**+5**. §11.3: a wrong accusation returns an insert built from that suspect's `eliminates` edge.

**The failure.** Accuse an innocent → lose 5 → receive their elimination evidence → cite it →
gain 5. Net zero, and the information was free. At EXPERT you can accuse all seven innocents,
break even, and be handed the culprit.

**Our rule (draft, to be tuned at playtest).** Two accusations per case; the third is final and
scored. The Reconsider insert names the contradiction with the group's stated theory and confers
**no** elimination credit.

---

### 9. Cut real-case ingestion

§3.1 and §14 buy a mechanism that is *verified plausible* — but §5 already concedes the forensic
model is a deliberate simplification, so realism is not what is being purchased. What is being
paid: an eligibility checklist, an adversarial search pass, legal and PR exposure, and a
rejection rate that falls hardest on the most interesting mechanisms (a mechanism distinctive
enough to be a good puzzle is distinctive enough to be findable).

Stage 1 already permits a **Synthetic Seed**. A combinatorial mechanism space is larger than the
pool of eligible real cases, fully controllable, and generates §13's diversity for free.

SYN-MVP-001 is wholly synthetic. §14 stays written and unused.

---

### 10. §13's mechanism pool is arithmetically too small — and leaks

Seven categories; the constraint excludes up to four (two edge types × two prior cases), leaving
three for two slots. By the third case the pool is nearly exhausted. Worse: a player who tracks
the rotation knows which mechanisms the current case **cannot** use. A diversity rule applied to
the answer's shape is information about the answer's shape.

**Proposed fix (not yet implemented).** Make a mechanism `category × epistemic failure mode` —
*the log is honest* / *the log is falsified* / *the log is absent where it should exist* /
*two logs disagree* / *the log is honest and measured in the wrong place*. SYN-MVP-001 uses the
last of those. Varying how a clue can *lie* matters far more than varying its noun, and the
cross-product is large enough to stop leaking.

---

### 11. §15's document suite cannot represent §10's tiers

§15 hard-codes transcripts **C-1 to C-4**. §10 allows **5–8 suspects** at HARD and EXPERT.
The document schedule breaks at HARD. Ours is variable-length.

---

## Open, not yet addressed

- **Uniqueness.** The DAG proves a valid path to the culprit *exists*. Nothing proves no other
  coherent theory fits the same evidence. A group that builds a reasonable alternative gets told
  "wrong" with no explanation — the classic mystery-game betrayal. Real uniqueness needs a
  constraint solver over the evidence set, not an edge-alignment check. **Deferred to MVP-2;
  hand-authoring makes it tractable for now.**
- **Player count vs. tier.** Nothing couples them. An EASY case (5 nodes) split across ten
  players in four squads gives each squad one node. Partition feasibility belongs in Stage 3.5b.
- **Solo phase gates** (§12) are honour-system with all pages in the box. Fix drafted, not built:
  Phase 2 opens only the transcripts for the suspects you named in writing at Phase 1.
