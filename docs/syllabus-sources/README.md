# Syllabus sources

The PDFs here are the source of truth for the bundled exam and board templates.
`packages/shared/scripts/build-templates.mjs` converts them into
`packages/shared/src/templates/bundled.generated.ts`, which is committed.

## Regenerating

```bash
pnpm --filter @preppilot/shared build:templates
```

Needs `pdftohtml` (poppler): `brew install poppler`. Only someone changing a
source PDF needs it — CI builds from the committed output, so nobody else does.

## Why font size, not indentation

Every heading in these PDFs sits at the same left margin. Plain text extraction
flattens the hierarchy completely: template, subject, chapter and topic all come
out at column 1. What distinguishes them is type size — 27pt for the template,
20pt subject, 16pt chapter, 13pt topic — so the generator reads poppler's XML
and keys off that.

The sizes are asserted, not guessed. A source PDF that uses a size the generator
does not recognise makes it stop with an error naming the offending line, rather
than silently dropping syllabus content into the wrong level.

## Provenance and verification

Every generated template is marked `verified: false` and carries the file it came
from. The library screen shows both, so a student can see that nobody has checked
it against the awarding body's published syllabus.

**Do not flip `verified` to true** — the generator does not set it — until
someone has compared a template against the official source. A student plans
months of study around one of these, and a wrong chapter list is worse than an
obviously provisional one.

## What is here

| File                                         | Templates                                      |
| -------------------------------------------- | ---------------------------------------------- |
| `01_JEE_NEET_Expanded_Syllabus_READABLE.pdf` | JEE Main 2026, NEET UG 2026, JEE Advanced 2026 |

## Still missing

PRD §13 also names **NEET-PG**, **IIT JAM**, **CBSE Class 10**, and the CBSE
Class 12 **PCM / PCB / PCMB / Commerce / Humanities** streams. Drop the PDFs in
this directory and re-run the generator; no code change is needed.
