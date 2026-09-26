# CASE BIBLE — SYN-MVP-002 · "THE RAVENSGATE INTERLOCK"

> **SPOILERS.** Facilitator/designer document. Machine truth is in `ledger.json`.

**Tier** HARD · **Players** 1–6 · **Target** 120–160 min · **Hand-authored (MVP-0)**

---

## 1. The one-line

> The log is honest. It says her card did it. Her card was in a desk drawer and she was in the water.

## 2. What Level 02 is for

Level 01 answered *"is deduction from documents fun?"* Level 02 answers the question the source
spec is actually built around and which Level 01 deliberately dodged: **does information asymmetry
between players add anything?**

So this case splits the file five ways and adds **exactly one** new mechanic — the Case Conference.
The Authority economy is carried over unchanged in shape, tightened by one per band, because Level
01 flagged it as possibly too generous. **One variable at a time**, or the playtest teaches nothing.

Level 01 is the control condition. If the Conference makes the room louder, it stays. If it makes
five people read quietly and then recite, it is cut, and §8 of the source specification is wrong.

## 3. The shape of the experience

**Level 01 opened with no crime and found one. Level 02 opens with a crime already solved and has to
take it apart.** The central act is not accusation — it is **exoneration**. The group must clear a
woman the file has already convicted, who is dead, and who cannot help them.

| | The file's version | The truth |
|---|---|---|
| **Ballard** | Killed Sarn at 06:03, then drowned herself. | Died at 02:50. Second victim. Her card was used three hours after she stopped breathing. |
| **Vey** | Blameless. Sat at console 1 all night; the telemetry proves it. | Killed both. His continuous presence is the whole disguise. |
| **Wrenn** | Peripheral. | The one man with a real institutional motive to bury it — and three separate records that clear him. |
| **Okonkwo** | Peripheral. | Signed for equipment she never checked. Negligent, ruined, innocent. |

## 4. What actually happened

Ravensgate Dam, night of 18–19 November, Storm Bettany, road cut by a landslip at 19:40. Six people
on site and nobody able to leave.

At 01:30 **Ines Ballard**, reconciling storm data, noticed that piezometers P-7 to P-12 were
reporting values that did not move with the reservoir. At 02:10 she and **Aurelio Sarn** went down
forty-one steps to the instrument gallery and opened junction box JB-7. It was empty. The array
certified as installed in 2019 under contract RG-0419 did not exist. The cable ends were hanging
loose behind the box.

**Halloran Vey** had certified that contract. He had also certified the second half of its scope —
the permanent decommissioning of legacy feeder F-3 — which had likewise not been done. Thennick
Instrumentation had paid him $186,000 across three years through a consultancy registered to his
wife.

At 02:25 Sarn told him it was going to the regulator at first light.

At 02:31 Vey opened intake gate 2. At 02:38 he stood up from console 1. At 02:45 he met Ballard on
the crest, walking to the site office for the as-built drawings, and put her over the forebay
parapet. She drowned by about 02:50 and the open gate carried her into the intake gallery, onto
trash rack panel 4. At 03:04 he sat back down and acknowledged eleven escalated alarms in
thirty-eight seconds. At 03:12 he shut gate 2 and the gallery went dry above the sill.

At 04:12 the storm's peak inflow packed a debris mat onto the rack **over** her.

At 05:40 he told Sarn that Ballard had walked off site and that C-14 was showing an earth fault on
F-5. Sarn isolated F-5, applied his own padlock, and did everything correctly — working from a
drawing, amended by Vey in 2019, that showed C-14 as single-fed. At 06:02 Vey closed the F-3 tie
from console 1, using Ballard's card, taken from the desk drawer she always left it in.

**The feeder Vey was paid to remove is what killed Sarn.** The mechanism and the motive are the same
lie.

## 5. The keystone — a hydrological clock

Pathology cannot help. B-2 says so in capital letters: prolonged immersion at 3–5 °C invalidates
algor mortis, rigor timing and vitreous potassium alike, and the Office **declines to estimate**.
That is deliberate — a group that played Level 01 will reach for body temperature first, and this
tells them fairly and immediately to find another clock.

The other clock is the reservoir:

1. She was recovered from **trash rack panel 4**, inside the intake gallery, downstream of gate 2.
2. The gallery is **dry above the sill whenever gate 2 is shut**. There is no other route in — the
   upstream stoplogs were in and the draft tube was under vacuum all night.
3. Gate 2 was open **02:31:08 – 03:12:44** and at no other time until 08:40.

> **Therefore she entered the water between 02:31 and 03:12.** Her credential was used at 05:47 and
> 06:02.

Corroboration (one Authority): the debris mat that formed at the 04:12 inflow peak lay **over** her.

Everything needed for the reframe is free — spread across the Board and File F-2. Only its
consequences cost Authorities. Same architecture as Level 01.

## 6. The alibi break — an absence

Vey's alibi is true and total: he was at console 1 all night, and File F-1 holds the session log
that says so. That is why nobody looked.

Storm-mode alarms escalate to the auto-dialler if unacknowledged for 90 seconds. Across the whole
night there is **one** gap: **02:38 to 03:04**, eleven alarms escalating unanswered, then all eleven
acknowledged in thirty-eight seconds at 03:05.

Control room to forebay parapet is four minutes each way (A-2 site plan).

**The evidence of his absence is the absence of evidence, in a system that records presence every
ninety seconds.** Nothing like Level 01's "the corroboration simply stops."

## 7. Solve path

```
  B-2  pathology CANNOT date her death        ─┐
  D-1  gate 2 open 02:31–03:12 only           ─┤
  F-2  she was found downstream of gate 2     ─┼─→ fact:ballard_window  ★ KEYSTONE
  F-2  gallery is dry when gate 2 is shut     ─┘        (02:31 – 03:12)
        │                                              [ACT-04 corroborates: debris mat over her]
        ├─→ D-1 her card was used at 05:47 and 06:02  →  BALLARD EXONERATED
        ├─→ F-3 permits clear Okonkwo         →  cleared
        ├─→ ACT-09 three records clear Wrenn  →  cleared (conjunction)
        └─→ ACT-02 her card was in the desk drawer  → fact:credential_separable
                 └─→ F-4 control room occupied by ONE person 02:25–05:47  ⟨cross-suspect⟩
                        └─→ D-1 the tie was closed AT CONSOLE 1  →  VEY: opportunity
                               ├─→ ACT-01 the 26-minute alarm gap  →  ALIBI BREAKS
                               ├─→ ACT-07 he amended the drawing; F-3 never removed ⟨cross-suspect⟩
                               └─→ ACT-06 $186,000 from Thennick  →  motive
```

Mbeki (`EV-14`, footbridge log, free) is the tutorial elimination.

## 8. Why the sweep still fails

| Suspect | Clearable by | Gated on |
|---|---|---|
| Mbeki | one free document | nothing — deliberately |
| Okonkwo | one free document | **the keystone** — her permits only clear her against windows you have to establish first |
| Wrenn | three documents at once | the keystone, plus an Authority |
| Ballard | the keystone itself | — |

Validator C7 confirms every non-tutorial clearance routes through `fact:ballard_window`.

## 9. Playtest watch-list

**The Conference is the experiment.** Everything else is a control.

1. **Does anyone hold a file and stay quiet?** That's the failure mode. Count how often the Query
   rule gets used — if it's never, the mechanic isn't working and the room is just taking turns.
2. **Does F-2 table the gallery documents in Session 1?** The keystone lives in one file. The Board's
   RDSI dissent note points straight at it, which should be enough. If the group still stalls, the
   asymmetry is a bottleneck rather than a texture, and that is a finding against §8.
3. **Compare against Level 01 directly.** Same group, both cases. Which room was louder? Which
   deduction felt more earned?

Secondary: does the tightened Authority budget (5/6/7) finally bite? Does anyone uphold the original
murder–suicide finding as their first accusation — and does the Reconsider insert for Ballard land
as a gut-punch or as a shrug?

## 10. The one thing to say afterwards

If the group gets there, someone will notice it unprompted, and it is the point of the case:

> The original inquiry did not make a mistake of reasoning. Every step it took was sound. It simply
> assumed that a credential is a person — and no document in the file ever said that it was.
