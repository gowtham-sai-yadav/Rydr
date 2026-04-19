# Rydr Phase 3 — Milestone plans

Detailed pre-implementation plans for each Phase 3 milestone. Read `PHASE3_PLAN.md` (repo root) first for context, thesis, scope, and the open decisions that govern all milestones.

## Workflow

1. **Discuss + finalize** a milestone with the team.
2. **Write the plan file** (`m{N}-{slug}.md`) capturing scope, data model, files touched, open questions.
3. **Review + approve** the plan.
4. **Implement** only after approval.
5. **Mark complete** when shipped.
6. **Move to next** — don't pre-write plan files for future milestones.

Plan files exist only for milestones that have been actively discussed. Future milestones are scoped in `PHASE3_PLAN.md §6` and get their own plan files as we approach them.

## Planned milestones

| # | File | Class | Status | Short goal |
|---|------|-------|--------|-----------|
| M1 | [m1-schema-rewrite.md](./m1-schema-rewrite.md) | Core | Plan ready — awaiting approval | Rewrite schema around Destination; Alembic migration; reseed |
| M2 | [m2-destination-discovery.md](./m2-destination-discovery.md) | Core | Initial scope sketched — detailed plan when M1 ships | Destination filters, detail, cost calc, Mapbox |
| M3 | [m3-ride-planning.md](./m3-ride-planning.md) | Core | Initial scope sketched — detailed plan when M2 ships | Refactor ride flow to target destinations |
| M4 | [m4-post-ride-capture.md](./m4-post-ride-capture.md) | Core | Initial scope sketched — detailed plan when M3 ships | Post-ride media + rating + feedback → flywheel |
| M5 | [m5-real-chat.md](./m5-real-chat.md) | Core | Initial scope sketched — detailed plan when M4 ships | Replace MOCK_MESSAGES with real chat |

## Upcoming (no plan file yet)

M6–M12 are scoped in `PHASE3_PLAN.md §6` and will get plan files as each milestone is discussed and finalized:

- M6 — Follow system
- M7 — Destination discussions
- M8 — Badges + achievement engine
- M9 — Code quality pass
- M10 — Communities (stretch)
- M11 — Live GPS sharing (stretch)
- M12 — Polish, demo prep, report

## Conventions

- **Naming:** `m{N}-{short-slug}.md` (lowercase, hyphenated)
- **Frontend rule:** no frontend changes in any milestone without a separate UX/design discussion and approval first. Backend work proceeds independently; frontend hooks up later.
- **Dependency rule:** any new package / service / env var / database introduced by a milestone is surfaced at the top of its plan for review before implementation.
