---
name: proposal-assembly
description: "Use when the NI Sales Agent has a sufficient scope and needs to produce the branded proposal deck for a prospect. Maps the captured scope and assumptions onto a Network Intelligence proposal deck and delegates rendering to the ni-branded-pptx skill."
---

# Proposal Assembly

Your job: turn `deal.scope` + `deal.assumptions` into a branded proposal **deck**, then
stage it (Outlook draft + Slack ping) for human approval. You do not invent pricing or
commitments beyond what scoping supports, and you make every assumption visible.

## Rendering

Rendering is handled downstream as a branded **PDF** — this skill only produces the proposal *content* (structured JSON), not slides.

## Deck structure (proposal variant of the NI deck pattern)

Adapt `ni-branded-pptx`'s standard structure to a proposal. Keep it tight — 8–11 slides:

1. **Title** (Dark) — "<Service line(s)> Proposal for <Company>", date, NI logo.
2. **Understanding your need** (Light) — restate their driver and deadline in their
   words. This proves you listened; it's the most important slide.
3. **Scope** (Light) — exactly what's in scope per line, as captured. A clean table.
4. **Assumptions** (Light) — every item from `deal.assumptions`, each with the one-line
   "tell us if this isn't right" framing. Never bury these.
5. **Approach / methodology** (Dark) — NI's method for the relevant line(s): phases,
   standards (OWASP, PTES, NIST, the relevant compliance framework), deliverables.
6. **Deliverables & timeline** (Light) — reports, retest, readout call; indicative
   timeline tied to their deadline.
7. **Why NI** (Dark) — differentiators relevant to *this* prospect (certifications,
   regional/scale proof, named-but-anonymized case if one fits the line).
8. **Commercials** (Light) — pricing **only if** scoping supports a number; otherwise a
   clearly-labelled indicative range with the assumptions it depends on. If you can't
   price responsibly, say so and propose a 20-min scoping call to finalize — do not
   fabricate a figure.
9. **Next steps / CTA** (Dark) — how to proceed, who to contact.

Populate `credentials` (lead with PCI QSA, PCI PIN Assessor, CREST, HITRUST) and `transilienceEdge` from the capability library; never invent.

Drop slides that don't apply (e.g. no `transilience` slide for a pure pentest deal).

## Structured deck fields

Populate these five fields from the captured scope and the capability library — do not invent:

- `understandingStats` — 3–4 quantified facts for stat tiles (asset counts, page counts, environments, deadlines). Use numbers from the scope; skip if not available.
- `pillars` — up to 3 reasons NI is the right fit for THIS engagement (short title + 1–2 sentence body grounded in credentials or methodology).
- `signals` — environment facts extracted from scope: stack, surfaces, interfaces, timeline.
- `approachPhases` — the ordered methodology phases for this engagement (e.g. Recon → Exploitation → Reporting).
- `ctaSteps` — exactly 3 next-step cards ({when, title, detail}).

For `commercials.text`: keep it to ONE short sentence. Detailed pricing and payment terms belong in a separate commercials document, not in the deck.

## Pricing discipline

- Never state a firm price the captured scope can't justify. An honest range beats a
  confident wrong number.
- Tie every commercial figure to the scope and assumptions it rests on.
- If pricing needs human input (it often will in v1), build the deck through slide 7,
  leave commercials as a placeholder, and flag in the Slack staging that the human should
  fill pricing before sending.

## Accompanying email

Also stage a short cover email (NI sales register): one line acknowledging their scope,
one line that the attached proposal includes the assumptions made, and an offer to walk
through it on a call. The deck is the artifact; the email is the handshake.

## Output

- Proposal (PDF) at `./out/<company-slug>-proposal-v<n>.pdf`.
- `deal.proposal = { deck_path, version, staged_at }` (the `deck_path` field now holds the PDF's S3 URI).
- Staged Outlook draft (proposal attached) + Slack staging post per CLAUDE.md format.
- Stage transition to `PROPOSAL_PENDING_APPROVAL`.
