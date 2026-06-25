# Capture System v2 — Design Plan

## Problem Statement

The current capture system has these gaps:
1. **Only post-hoc capture** — no way to stream/record during work
2. **Over-splitting** — tiny tasks become 5-6 separate .md files when 1-2 would suffice
3. **No deduplication** — same knowledge gets captured again across sessions
4. **Flat template** — misses the reasoning/story behind decisions
5. **Branch not auto-tagged** — must manually add git branch info
6. **No hover preview** — recent captures in UI show no content preview
7. **No cross-tool support** — needs to work in Claude Code, Cowork, Cursor, Copilot

---

## 1. Three Capture Modes

### 1.1 Session Capture (streaming)

**Commands:** `/capture-start [goal]` → work normally → agent suggests completion → user confirms → `/capture-end`

**Flow:**
1. User runs `/capture-start "fix the 500 bug on headerMessage"`
2. Agent records the conversation turn index as `capture_start_marker`
3. Normal work continues — no overhead
4. When agent detects the goal is likely met (tests pass, PR merged, etc.), it asks: *"Looks like the 500 fix is verified. End capture session?"*
5. User confirms (required — never auto-end)
6. Agent reviews all context between markers, generates narrative capture(s)

**Key rules:**
- Multiple session captures can overlap (nested goals)
- If user forgets `/capture-end`, agent reminds after extended idle or topic change
- Session ID stored in frontmatter as `session_ref`

### 1.2 Range Capture (bounded)

**Commands:** `/capture-begin [topic]` → work → `/capture-end`

**Flow:**
1. User runs `/capture-begin "investigating the merge conflict"`
2. Work happens
3. User runs `/capture-end` — agent generates capture from that range only
4. Multiple ranges can exist within one session

**Difference from session:** Range is for a specific sub-topic within a larger session. Session is for the entire goal.

### 1.3 Post-hoc Capture (current, improved)

**Commands:** `/capture` (scan & pick) or `/capture [topic]` (targeted)

**Improved flow:**
1. Agent scans the full session for capture-worthy items
2. **Proposes a grouping plan first** — "I'd group these into 2 captures: (A) the bug fix story, (B) the git gotcha"
3. User confirms/adjusts the grouping
4. Agent generates captures per the approved plan

### 1.4 Quick Commands

Shortcuts for common capture patterns — no ceremony, minimal prompts.

| Command | What it does |
|---|---|
| `/capture-last N` | Capture the last N conversation turns. Agent distills them into a narrative. Good for "that thing we just figured out." |
| `/capture-this` | Capture the agent's most recent response as a standalone note. Useful for explanations, code patterns, or answers worth saving. |
| `/capture-add [id]` | Append new content to an existing capture by ID. Agent adds a new `##` section (e.g., "## Day 2" or "## Follow-up") rather than overwriting. |
| `/capture-update [id]` | Update metadata on an existing capture — change status, add tags, update summary, mark as resolved. |
| `/capture-search [query]` | Quick search across existing captures. Returns top 5 matches with title + preview. Useful before creating to check for duplicates. |
| `/capture-link [id1] [id2]` | Add a `related:` link between two existing captures. |
| `/capture-status` | Show active capture sessions (any `/capture-start` or `/capture-begin` that hasn't ended yet). |

**Examples:**

```
/capture-last 3
→ Agent reviews the last 3 turns, generates:
  [learning] "Tauri v2 requires PascalCase for titleBarStyle"

/capture-this
→ Agent takes its most recent response, distills it:
  [pattern] "Reciprocal Rank Fusion scoring with temporal decay"

/capture-add 2026-06-25-001
→ "What to add?"
→ "we found a second root cause — the null check in getPlaceholderCount"
→ Appends ## Update section to existing capture

/capture-update 2026-06-25-001
→ "What to update?"
→ "status: resolved, add tag: merged-to-release"
→ Updates frontmatter in-place
```

---

## 2. Smart Consolidation Rules

### Core Principle
**One logical unit of work = one file.** Not one atomic concept.

### Rules

| Scenario | Action |
|---|---|
| Bug fix with debugging gotchas | ONE file — gotchas as ## sections within the fix narrative |
| Bug fix + completely unrelated learning | TWO files — only if the learning is useful outside this bug's context |
| Multi-step feature with sub-tasks | ONE file — sub-tasks as ## sections |
| Architecture decision with tradeoff analysis | ONE file |
| Same-branch work across multiple sessions | UPDATE existing capture (see dedup) |

### The "3-month test"
Before splitting into a separate file, ask: *"Would someone searching for THIS specific thing, 3 months from now, ever search for it WITHOUT the context of the parent task?"*
- **Yes** → separate file (e.g., "git modify/delete conflict has no markers" — generic, reusable)
- **No** → section within the parent capture (e.g., "the merge conflict on THIS branch" — only meaningful in context)

### Agent behavior
The agent MUST propose its grouping plan and get user confirmation before writing files. Show:
```
Proposed captures:
1. [bug-fix] "headerMessage 500 — investigation, fix, and revert" (sections: Context, Problem, the IMException fix, the merge conflict, the revert decision)
2. [gotcha] "Git modify/delete conflict leaves no markers" (standalone — generic knowledge)

Create these 2? Or adjust?
```

---

## 3. Deduplication Strategy

### Before creating any capture:

1. **Branch + project match**: Search existing captures where `git.branch` matches current branch AND `projects` overlap
2. **Title similarity**: FTS5 search with the proposed title — if top result scores > 0.8, flag
3. **Embedding check**: Generate embedding for proposed body, compare against recent captures (last 30 days). If cosine similarity > 0.85, flag as potential duplicate
4. **Agent behavior on duplicate detected**:
   ```
   ⚠ Found existing capture that looks similar:
   → "headerMessage 500 bug — initial investigation" (2026-06-24)

   Options:
   (a) UPDATE that capture with new information (recommended — same branch, same topic)
   (b) CREATE new capture (if this is genuinely different)
   (c) LINK via related: field (connected but distinct)
   ```

### Update flow
When updating an existing capture:
- Append new sections (## Day 2, ## Resolution) rather than overwriting
- Update `summary` to reflect current state
- Add new tags, files, commits
- Keep original `date`, add `updated: YYYY-MM-DD` to frontmatter

---

## 4. Template v2

### New frontmatter fields

```yaml
---
id: "{uuid}"
title: "headerMessage 500 bug — full story"
space: work
type: bug-fix              # note | learning | gotcha | pattern | decision | bug-fix | feature | investigation
date: "2026-06-25"
updated: "2026-06-26"      # NEW — set on updates
summary: "Customer 500 on header message. Root cause: missing null check. Fixed with IMException catch."
status: active
capture_mode: post-hoc     # NEW — session | range | post-hoc
session_ref: ""            # NEW — session ID or transcript path (optional)

tags: [feature/header-message, zohoim, 500-bug]   # branch ALWAYS included
projects: [zohoim]
related: []
files: [ChatMessageService.java, HeaderController.java]

project:
  name: zohoim
  path: ~/ZIDE/zohoim

git:
  branch: feature/header-message     # auto-detected, always populated
  repo: zohoim
  remote: origin
  commits:
    - hash: abc1234
      message: "fix: add null check in constructHeaderParams"

chain:
  prev: null               # previous capture in a multi-part series
  refs: []

links: []
color: null
icon: null
---
```

### Body sections — adaptive, not rigid

The body uses a **section menu** — the agent picks the sections that fit the capture type. Not every capture uses all sections. The agent should never force empty sections just to match a template.

#### Full section menu

| Section | When to use | Example |
|---|---|---|
| `## Context` | Always for bug-fix, feature, decision | "Customer reported 500s on header message API" |
| `## Problem` | When something was broken or needed | "IMException not caught, generic catch swallowing message" |
| `## Goal` | When no problem — just building something | "Add color + icon picker to capture cards" |
| `## Investigation` | When debugging or research happened | "Tried X, failed because Y, discovered Z" |
| `## Solution` | When a fix/approach was chosen | "Added IMException catch before generic Exception" |
| `## Code` | When specific code is worth preserving | Snippet with file path, before/after, or key pattern |
| `## Outcome` | When there's a concrete result | "Merged to release, deployed, customer confirmed" |
| `## Takeaways` | When there's reusable knowledge | "Always check release before gold-plating" |
| `## Follow-ups` | When there are open items | Checklist items — stay in capture, not auto-tasked |

#### Section combos by capture type

**bug-fix**: Context → Problem → Investigation → Solution → Code → Outcome → Takeaways
**feature**: Context → Goal → Solution → Code → Outcome
**decision**: Context → Problem → Investigation (options considered) → Solution (what we chose + why)
**learning / pattern**: Context → Problem → Solution → Code → Takeaways
**gotcha**: Problem → Solution → Code (short and punchy — 2-3 sections max)
**note**: Context → free-form (no enforced structure)

#### Key exchanges — inline, not separate

Important decision moments are quoted inline within the relevant section, not in a separate section:

```markdown
## Investigation
Tried adding a specific `IMException` catch before the generic one.

> **Key decision**: Initially renamed the parameter for clarity, but reverted
> because release already met the PM's literal requirement. Don't gold-plate.

Also discovered a latent NPE in `constructHeaderParams` — `getPlaceholderCount(null)`
with no null guard. Logged as follow-up, out of scope for this fix.
```

#### `## Code` section — when to include

Include `## Code` when the capture involves a specific pattern, fix, or implementation worth referencing later. Format:

```markdown
## Code

**File:** `src/services/ChatMessageService.java`

```java
// Before — generic catch swallows the message
} catch (Exception e) {
    return Response.status(500).build();
}

// After — IMException gets specific 422 with message
} catch (IMException e) {
    return Response.status(422).entity(e.getMessage()).build();
} catch (Exception e) {
    return Response.status(500).build();
}
```˙

Keep code snippets focused — only the relevant diff or pattern, not entire files.
```

#### Follow-ups — capture-only, not auto-tasked

Follow-up items stay as checklist items within the capture. They are **not** auto-generated as tasks in any external system. Rationale: captures are knowledge records, not task queues. Most follow-ups are low-priority "nice to have" items.

To promote a follow-up to an actual task, explicitly run:
- `/capture-follow [id]` — shows follow-up items, lets you pick which to promote
- Or tell the agent: "create a ticket for follow-up #2 from capture 001"

Future: if Jira/Linear integration is added, the capture detail view in the UI could offer a "promote to ticket" button per follow-up item.

#### Full example

```markdown
---
id: "a1b2c3d4"
title: "headerMessage 500 bug — investigation, fix, and revert decision"
space: work
type: bug-fix
date: "2026-06-25"
summary: "Customer 500 on header message API. Root cause: missing IMException catch. Fixed, then reverted param rename after merge conflict revealed release already had the 422 validation."
status: active
capture_mode: post-hoc
session_ref: ""
tags: [feature/header-message, zohoim, 500-bug]
projects: [zohoim]
related: []
files: [ChatMessageService.java, HeaderController.java]
project:
  name: zohoim
  path: ~/ZIDE/zohoim
git:
  branch: feature/header-message
  repo: zohoim
  remote: origin
  commits:
    - hash: abc1234
      message: "fix: add IMException catch in handleMessage"
    - hash: def5678
      message: "revert: remove param rename, anchor to literal requirement"
chain:
  prev: null
  refs: []
links:
  - url: https://jira.internal/ZOHOIM-4521
    label: "Original ticket"
color: null
icon: null
---

## Context
Customer reported intermittent 500 errors on the header message API.
Ticket: ZOHOIM-4521. Escalated path: CFA → SDE → PM.

## Problem
`ChatMessageService.handleMessage()` threw unhandled `IMException` on invalid
header content. The generic `Exception` catch was swallowing the specific
validation message, returning a bare HTTP 500 with no useful error body.

## Investigation
Traced the 500 to the catch chain in `handleMessage`. The `IMException`
(thrown by the IM SDK for validation failures) was falling through to the
generic `Exception` catch, which returns 500.

> **Key decision**: Initially added a renamed parameter for clarity, but
> reverted after the merge conflict with release. Release had independently
> added the same 422 validation — gold-plating wasn't needed.

Also found a latent NPE in `constructHeaderParams` — `getPlaceholderCount(null)`
with no null guard. Out of scope, logged as follow-up.

## Solution
Added specific `IMException → 422` mapping before the generic catch.
Kept `IMError → passthrough` and `Exception → 500` unchanged.

## Code

**File:** `src/services/ChatMessageService.java`

```java
} catch (IMException e) {
    return Response.status(422).entity(e.getMessage()).build();
} catch (IMError e) {
    throw e;  // passthrough — infrastructure error
} catch (Exception e) {
    log.error("Unexpected error in handleMessage", e);
    return Response.status(500).build();
}
```˙

## Outcome
- Merged to `feature/header-message`
- Merge conflict with release revealed release independently added the 422 validation
- Reverted param rename — anchored to the PM's literal requirement
- Customer-facing 500s resolved

## Takeaways
- Always check what the release branch already has before building on top
- Git modify/delete conflicts leave NO conflict markers — diagnose via `git ls-files -u`

## Follow-ups
- [ ] Fix latent NPE in `constructHeaderParams` (getPlaceholderCount null check)
```

---

## 5. Cross-Tool Support

The capture system needs to work across:

| Tool | How it captures |
|---|---|
| **Claude Code** | `/capture` command in the same session. Has full conversation context. Primary capture source. |
| **Cowork** | `/capture` in Cowork sessions. Same mechanism but may have different tools available. |
| **Cursor / Copilot** | Via MCP server mode (planned). Exposes `brainos/capture` tool. Agent passes structured data, BrainOS writes the file. |
| **Manual** | User creates .md file directly in `~/knowledge-base/captures/`. File watcher picks it up. |

### MCP capture tool (future)
When BrainOS MCP server is implemented, expose:
```
Tool: brainos_capture
Args: { title, type, summary, body, tags[], branch?, project?, mode? }
Returns: { id, file_path }
```
This lets any AI tool that speaks MCP create captures without needing BrainOS-specific commands.

---

## 6. Branch Auto-Tagging

### Implementation
1. **At capture time**: Agent detects current git branch from the working directory
2. **Auto-add to tags**: `tags: [feature/header-message, ...]` — branch name always first tag
3. **Auto-populate git.branch**: Even if user doesn't specify
4. **Fallback**: If not in a git repo, skip (don't error)

### In Claude Code
```bash
git -C "$PWD" rev-parse --abbrev-ref HEAD 2>/dev/null
```

### In Cowork/Cursor
Pass branch info via MCP tool args or detect from workspace context.

---

## 7. UI: Hover Card Preview

### Current state
Recent captures in the sidebar show only the title.

### Proposed
On hover, show a card with:
- **Title** (bold)
- **First ~3 lines of body_text** (truncated, muted color)
- **Date** (small, right-aligned)

### Implementation
- `CaptureOverview` already has `summary` — but we want body preview
- Option A: Add `body_preview: Option<String>` to `CaptureOverview` (first 200 chars of body_text, computed at query time)
- Option B: Fetch from `captureCache` on hover (already have this mechanism in ChatHistorySidebar)

**Recommendation**: Option A — cheaper, no extra IPC call on hover. Add `SUBSTR(body_text, 1, 200)` to the overview query.

---

## 8. Implementation Phases

### Phase A: Template + Consolidation (no backend changes)
- [ ] Update `files.rs` — new template with `capture_mode`, `updated`, `session_ref` fields
- [ ] Update `parser.rs` — parse new frontmatter fields
- [ ] Update `models.rs` — add `capture_mode`, `updated`, `session_ref` to Capture
- [ ] Add migration 008 — new columns in captures table
- [ ] Update `queries.rs` — handle new fields in upsert
- [ ] Write capture instruction prompt for Claude Code `.instructions.md`

### Phase B: UI Hover Preview
- [ ] Add `body_preview` to `CaptureOverview` query (SUBSTR 200 chars)
- [ ] Update `models.rs` — add `body_preview` to `CaptureOverview`
- [ ] Update `ipc.ts` — include `body_preview` in type
- [ ] Build hover card component in the sidebar/HomeView

### Phase C: Deduplication
- [ ] Add `check_duplicate` command — search by branch + project + embedding similarity
- [ ] Update capture creation flow — check before write
- [ ] Add update-capture command (append sections, update metadata)

### Phase D: Capture Modes (agent-side)
- [ ] Session capture mode — start/end markers in conversation context
- [ ] Range capture mode — bounded markers
- [ ] Improved post-hoc — grouping proposal before write

### Phase E: MCP Capture Tool
- [ ] Expose `brainos_capture` via MCP server
- [ ] Expose `brainos_check_duplicate` via MCP server
- [ ] Works from Cursor, Copilot, or any MCP-compatible tool
