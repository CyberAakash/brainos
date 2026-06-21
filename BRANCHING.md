# BrainOS Branching Strategy

## Branches

| Branch | Purpose | Merges from | Merges to |
|--------|---------|-------------|-----------|
| `main` | Stable, release-ready code | `release` only | — |
| `release` | Integration & staging | `feature/*`, `fix/*` | `main` |
| `feature/*` | New functionality | — | `release` |
| `fix/*` | Bug fixes | — | `release` |
| `hotfix/*` | Critical production fixes | — | `main` (then back-merge to `release`) |

## Rules

1. **`main` is protected.** Only `release → main` merges are allowed. No direct commits, no feature branch merges.
2. **All work goes through `release`.** Create a `feature/*` or `fix/*` branch, do your work, merge into `release`.
3. **`release → main` only on explicit approval.** When everything in `release` is verified and stable, merge to `main`.
4. **Hotfixes are the sole exception.** For critical bugs in `main`, create `hotfix/*` from `main`, fix, merge to `main`, then back-merge `main` into `release` to keep them in sync.
5. **No force-pushes to `main` or `release`.**

## Branch Naming

```
feature/short-description    e.g. feature/entity-graph-ui
fix/short-description        e.g. fix/fts5-special-chars
hotfix/short-description     e.g. hotfix/db-migration-crash
```

## Workflow

```
feature/foo ──→ release ──→ main
fix/bar     ──→ release ──┘  ↑
hotfix/critical ─────────────┘ (back-merge to release)
```

## Merge Commands

```bash
# Merge feature into release
git checkout release
git merge feature/my-feature --no-ff

# Merge release into main (only when approved)
git checkout main
git merge release --no-ff
git tag -a v0.x.x -m "Release v0.x.x"

# Hotfix workflow
git checkout -b hotfix/critical main
# ... fix ...
git checkout main
git merge hotfix/critical --no-ff
git checkout release
git merge main  # back-merge
```
