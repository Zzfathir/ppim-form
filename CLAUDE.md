# PPI Form

Form builder for PPI Malaysia with a secretary dashboard.

The source of truth is in spec/. Read before making changes:
- spec/PPI_Form_PRD.md (what and why)
- spec/PPI_Form_BUILD_PROMPT.md (how: data model, permissions, build order)

Rules:
- P0 scope only; do not add features not in the spec.
- Permissions are enforced on the server, never only in the UI.
- Never commit secrets; keep .env.example up to date.
- Record assumptions in DECISIONS.md.
- Commit at the end of each build phase.
- Departments come from the database (seeded from spec/seed/departments.json), never hard-coded.