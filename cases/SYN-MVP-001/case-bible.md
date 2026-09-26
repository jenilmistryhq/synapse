# CASE BIBLE — SYN-MVP-001 · "THE HALVORSEN BEQUEST"

> **SPOILERS.** This is the facilitator/designer document. Players never see it.
> Machine-readable truth lives in `ledger.json`; this is the same thing for humans.

**Tier** MEDIUM · **Players** 1–6 · **Target** 90–120 min · **Authored by hand (MVP-0)**

---

## 1. The one-line

> The time of death is wrong, and everything you believe about who had an alibi is downstream of it.

## 2. The shape of the experience

The case **opens as an accident.** A 54-year-old man with a documented heart condition
was found dead in a cold store held at 15% oxygen — a room he had a standing medical
exemption barring him from entering. The autopsy's provisional manner is ACCIDENTAL.
There is no murder on the table when the players sit down.

Then the inversion:

| | Before the reframe | After the reframe |
|---|---|---|
| **Marchetti** (culprit) | Cleared. Airtight — she was at a donor dinner 22 km away for the entire estimated window. | The only person alive without an alibi. |
| **Kovaleski** | Prime suspect. Alone in the vault with him, passed over for his job, and she lied about when she left. | Cleared. Six kilometres away on a tram. |
| **Pryce** | Strong suspect. Holds an override credential, skipped his round, falsified a log, delayed the call. | Cleared — but only by three documents at once. |
| **Ferraro** | Suspicious on paper. | Cleared cheaply, early. |

**The suspect list flips whole.** That is the emotional payload — not "who did it," but
"every single thing you concluded in the first hour was built on a number somebody
wrote down in the wrong room."

## 3. What actually happened

Tobias Renn, Head of Conservation, was auditing the Halvorsen Bequest — nineteenth-century
albumen prints on loan, stored at 6 °C under the loan agreement. He found that four
plates had been swapped for modern reproductions. Vivienne Marchetti, the Facility
Director, had sold the originals by private treaty for $412,000 over fourteen months.

At 18:41 Renn messaged her: *"Found the problem with Halvorsen. I'm in B2 tonight. This can't wait."*

She went to her donor dinner, was photographed there, left quietly at about 20:20 from a
forty-guest floating room where nobody could say when she went, and came back through the
**Level D service door** at 21:32 — not the lobby. She confronted Renn in Cold Store 3,
stepped into the corridor, sealed the door, and at **21:58:41** triggered a manual hypoxic
discharge from panel B2-P1, overriding the occupancy interlock by hand. Oxygen fell from
15.0% to 9.4%. He died at about **22:06**. She vented the room at 22:20, went back in, took
his tablet, and left at 22:34.

**Her mistake:** she took the tablet. At 21:51 he had already saved
`HALVORSEN_DISCREPANCY_v4.docx` to the conservation server.

**Her luck:** the body lay in a 6 °C room. The responding officer measured ambient
temperature at 00:29 — in the **corridor**, eighteen minutes after paramedics had carried
the body out of the cold store. That figure, 20.8 °C, went onto the intake form. The Deputy
ME did entirely correct arithmetic on it and estimated death at 19:41. Marchetti was
photographed at a dinner table at 19:41.

She did not plan the temperature error. She got it for free. The players' job is to notice.

## 4. The maths, as a player does it

Printed in the autopsy (Doc B-1):
- Liver temperature **32.5 °C** at 00:41. Baseline 37.0. Drop **4.5 °C**.
- Methodology line: *"Ambient at scene 20.8 °C per responding officer intake form. Standard cooling constant 0.9 °C/hr applied."*
- 4.5 ÷ 0.9 = **5.0 hours** → TOD 19:41, window 19:10–20:10.

Printed in the climate log (Doc D-1): Cold Store 3 held **6.0 °C** continuously.

The autopsy's own methodology appendix gives the rule: cooling rate is proportional to the
body–ambient differential. At 6 °C rather than 21 °C the multiplier is **1.94**.

> **5.0 ÷ 1.94 = 2.6 hours → death at 22:06. Corrected window 21:45–22:25.**

One division. A pencil does it. This is deliberate — the insight must be hard to *find* and
trivial to *check*, never the reverse.

## 5. Two doors into the reframe

Neither alone is enough. This is the case's central conjunction.

- **Door A — the contradiction.** `EV-05`: the server logs Renn saving a file at **21:51**,
  two hours after he supposedly died. Proves the window is wrong. Gives a floor, not a window,
  and clears nobody.
- **Door B — the mechanism.** `EV-03` + `EV-04`: the 20.8 °C reading was taken in the corridor
  after the body was moved; the cold store was at 6.0 °C. Explains *why* the window is wrong
  and lets you compute the right one — but on its own it is a hypothesis about a clerical error.

Together they produce a bounded corrected window that clears two suspects and condemns one.

## 6. The solve path

```
   EV-01  cause of death: hypoxia, provisionally ACCIDENTAL
     └─ EV-02  stated window 19:10–20:10  (ambient 20.8 °C assumed)
          └─ EV-03  that 20.8 was measured in the corridor, after the body moved
               └─ EV-04  cold store was 6.0 °C  ┐
                    └─ RECOMPUTE ───────────────┴─→  fact:corrected_tod_window  ★ KEYSTONE
                         └─ EV-05  he saved a file at 21:51  → window CONFIRMED 21:45–22:25
                              ├─→ EV-11 clears Kovaleski (out 21:26)
                              └─ EV-14  "2 discrete events logged"  → spend ACT-11
                                   └─ EV-06  MANUAL DISCHARGE 21:58, interlock overridden
                                        │      ↳ this is where it stops being an accident
                                        ├─ EV-07  Level-4 credential: exactly two holders
                                        │         Marchetti + Pryce  (cross-suspect edge)
                                        ├─ EV-08 [ACT-01]  she badged Level D at 21:32, out 22:34
                                        │    └─ EV-09 [ACT-08]  dinner corroborated only to 20:16
                                        │         └─ ALIBI BREAKS
                                        └─ EV-06+08+10 [ACT-03]  clears Pryce by conjunction
```

Ferraro (`EV-12`) clears for free at any time — the tutorial elimination.

## 7. The red herrings both have real secrets

This is what makes them work. Each behaves guiltily because each **is** guilty — of something else.

- **Pryce** skipped the 22:00 round, back-dated the handwritten log, and sat on the emergency
  call for fourteen minutes. He was asleep off-post in the loading bay office. Every suspicious
  act is a man covering up sleeping on shift.
- **Kovaleski** lied about her departure time in her first statement. She was using Meridian's
  solvent store and vacuum table after hours for a private commission. Contract breach.

Neither lie is a murder lie. Both will be defended fiercely, which is exactly why they read as
murder lies.

## 8. Why the elimination sweep does not work here

The dominant strategy in the source spec — collect every clearing card, accuse whoever has
none — is dead by construction:

| Suspect | Clearable by | Gated on |
|---|---|---|
| Ferraro | one free document | nothing — deliberately |
| Kovaleski | one document | the keystone. Against the *stated* window her badge clears nothing; she is inside it for all of it. |
| Pryce | three documents at once | the keystone, plus two spent actions |

You cannot reach two of the three clearances without doing the real work first.
`tools/validate.js` check **C7** enforces this mechanically for every future case.

## 9. Playtest watch-list

The three things the first table measures. Everything else is noise.

1. **Does anyone find Door A?** If the 21:51 file write goes unnoticed for 45 minutes, the
   signpost is too quiet and the case stalls. *Mitigation held in reserve:* Renn's message
   at 18:41 in a transcript, making the audit thread louder.
2. **Is the reframe an "aha" or a shrug?** Watch faces at the moment somebody says *"wait —
   where was that thermometer?"* If there is no visible reaction, the case has a correct spine
   and no soul, and we rebuild rather than polish.
3. **Does the Investigation Clock hurt?** Budget is 7 actions for four players; the minimum
   winning set is 4. If nobody agonises over a choice, cut the budget to 5 and re-run.

Secondary: time-to-first-elimination (target under 20 min — Ferraro exists for this);
whether anyone accuses Kovaleski early and how that failure feels; whether the arithmetic
is a pleasure or a chore.
