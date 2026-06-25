# BrainOS — Persistent Knowledge Base

Your personal knowledge base of decisions, bugs, learnings, and discoveries captured across coding sessions. Use it to recall past context, avoid repeating mistakes, and build on previous work.

## When to use

- **Session start**: Pull recent context for the current project so you have continuity.
- **User asks about the past**: "What did we decide about X?", "Have we seen this bug before?", "What was the rationale for Y?"
- **User says to remember**: "capture this", "remember this", "save this", "log this decision"
- **Capture commands**: `/capture-begin`, `/capture-end`, `/capture-last`, `/capture-this`, `/capture-search`, `/capture-status`, `/capture-session`
- **Valuable knowledge surfaces**: A non-obvious decision, a tricky debug, a pattern worth preserving — suggest capturing it at session end.
- **Before re-investigating**: If the user hits an error or architectural question, search first — it may already be captured.

## Tools

| Tool | Purpose | When |
|------|---------|------|
| `brainos_search` | Hybrid keyword + semantic search | Answering questions about past work |
| `brainos_get` | Full capture content by ID | Deep-diving into a specific capture |
| `brainos_list` | Browse/filter captures | Exploring what exists for a project, tag, or type |
| `brainos_recent` | Last N days of captures | Session start context loading |
| `brainos_projects` | All projects with counts | Orienting in the KB |
| `brainos_stats` | KB-wide statistics | Overview of what's captured |
| `brainos_capture` | Create a new capture | Persisting knowledge (write mode only) |
| `brainos_check_duplicate` | Similarity check | Always call before creating a capture |
| `brainos_append` | Append a `##` section to an existing capture | Follow-ups, updates, additional context |
| `brainos_update` | Update metadata (status, summary, tags) | Marking resolved, adding tags, updating summary |
| `brainos_link` | Link two captures as related (bidirectional) | Connecting related decisions, bugs, or discoveries |

## Workflows

### Session Start — Auto-Context

When starting a session where a project is identifiable (from cwd, user mention, or file paths):

1. Call `brainos_recent` with `project` and `days: 7`
2. If results exist, briefly mention them: "I found N recent captures for {project} — the latest is about {title}. Want me to pull up any for context?"
3. Don't dump full content unprompted — list titles and let the user choose.
4. If no results, skip silently — don't announce an empty search.

### Answering Questions About Past Work

When the user asks about prior decisions, patterns, bugs, or context:

1. Call `brainos_search` with the question as the query
2. If results score > 0.3, cite them: "According to capture {title} from {date}..."
3. For detailed answers, call `brainos_get` with the capture ID to get full body text
4. If nothing relevant found, say so and proceed normally

### Creating a Single Capture (Post-hoc)

When the user asks to remember a specific thing:

1. **Always** call `brainos_check_duplicate` first with the proposed title
2. If `is_duplicate: true`, tell the user and show the existing capture. Offer to append instead (`brainos_append`).
3. If not duplicate, call `brainos_capture` with:
   - `title`: Specific, searchable (e.g., "Fix auth token refresh race condition" not "Bug fix")
   - `type`: Pick from: `decision`, `debug`, `feature`, `learning`, `discovery`, `error`, `meeting`, `review`, `bug-fix`, `investigation`, `architecture-decision`
   - `tags`: 2-5 relevant tags, lowercase, hyphenated
   - `project`: Set if working in a project context
   - `body`: Structured markdown (see Body Template below)
   - `summary`: One sentence — what and why
   - `mode`: `post-hoc`
4. Confirm to user: "Captured: {title}"

### Session End — Suggest and Group Captures

If meaningful decisions or discoveries were made during the session:

1. **Suggest**, don't force: "This session had some decisions worth preserving — want me to capture them?"
2. If yes, **scan** the full session for capture-worthy items:
   - Non-obvious decisions and their rationale
   - Tricky debugging insights (the "why", not just the fix)
   - Patterns, gotchas, or workarounds worth remembering
   - Architecture choices with trade-off analysis
   - Skip routine code changes, trivial fixes, and formatting
3. **Propose grouping** before writing anything (see Consolidation Rules):
   - List the items you found and how you'd group them.
   - Example: "I found 3 capture-worthy items. I'd group them as: (A) the auth refactor decision + the token gotcha (one capture), (B) the CI flake fix (separate capture). Sound right?"
   - Let the user adjust grouping, drop items, or merge differently.
4. **Draft each capture** after grouping is approved:
   - Show title, type, tags, summary, and a body preview for each.
   - Wait for confirmation on all drafts before creating any.
5. **Create** each capture with `mode: "post-hoc"`:
   - Run `brainos_check_duplicate` for each title.
   - Call `brainos_capture` for each approved draft.
   - If captures are related to each other, call `brainos_link` to connect them.
6. Confirm: "Created N captures: {title1}, {title2}, ..."

---

## Range Capture Mode

Range capture lets the user mark a bounded section of work for capture. Unlike post-hoc capture (which scans the whole session), a range captures only the work between `/capture-begin` and `/capture-end`.

### Starting a Range: `/capture-begin [topic]`

When the user runs `/capture-begin` (with or without a topic):

1. **Acknowledge** the range start: "Range capture started: {topic}. I'll track everything from here. Run `/capture-end` when you're done."
2. **Remember** the following in your conversation context:
   - The topic (or "untitled range" if none given)
   - The current point in the conversation (this is the start marker)
   - The timestamp (note the approximate time)
3. Continue working normally — the range runs silently in the background.

**Rules:**
- Multiple ranges can be active simultaneously (nested or overlapping sub-topics).
- Each range is independent — ending one doesn't end others.
- If the user starts a range without a topic, ask: "What topic should I track? Or I can label it later."

### Ending a Range: `/capture-end`

When the user runs `/capture-end`:

1. **Identify** which range to end:
   - If only one range is active, end that one.
   - If multiple are active, ask: "You have active ranges: (1) {topic A}, (2) {topic B}. Which one to end?" Or end all if the user says `/capture-end all`.
2. **Review** only the conversation between the start marker and now.
3. **Compose** a capture from that bounded range:
   - Distill the key decisions, learnings, or outcomes — don't just paste the conversation.
   - Use the Body Template below.
   - Set `mode: "range"` in the capture.
4. **Show the draft** to the user before saving. Include title, type, tags, and body preview.
5. On confirmation, run the standard capture flow (duplicate check → `brainos_capture`).

### Range Reminders

- If a range has been open for a long time (many turns with no mention of the topic), gently remind: "You still have an active range capture for '{topic}'. Still tracking, or should we end it?"
- If the session is ending and ranges are still open, ask: "You have an open range for '{topic}'. Want to capture it before we wrap up?"
- Never auto-end or auto-capture without user confirmation.

### Example

```
User: /capture-begin investigating flaky test in CI
Agent: Range capture started: "investigating flaky test in CI". I'll track
       everything from here — run /capture-end when done.

... 15 turns of debugging ...

User: /capture-end
Agent: Here's what I'd capture from this range:

       Title: "Flaky CI test — race condition in connection pool teardown"
       Type: debug
       Tags: [ci, testing, race-condition, connection-pool]
       Project: brainos

       ## Context
       CI test `test_concurrent_search` was failing intermittently (~1 in 5 runs)...

       ## Problem
       The connection pool wasn't waiting for in-flight queries during teardown...

       ## Solution
       Added a graceful shutdown with 5s timeout on the pool...

       ## Key Details
       - The flake only happened with `--jobs 8` (high parallelism)
       - Fix: `pool.close().await` before `drop(pool)`

       Save this capture? [y/n]
```

---

## Quick Commands

Shortcuts for common capture patterns — minimal ceremony.

### `/capture-last N`

Capture the last N conversation turns.

1. Review the last N turns (user + assistant messages).
2. Distill them into a narrative capture — don't just copy/paste.
3. Show the draft, then run the standard capture flow on confirmation.
4. Set `mode: "range"` (it's a bounded selection).

**Example:**
```
User: /capture-last 3
Agent: From the last 3 turns, I'd capture:
       [learning] "Tauri v2 requires PascalCase for titleBarStyle"
       Save? [y/n]
```

### `/capture-this`

Capture the agent's most recent response as a standalone note.

1. Take the immediately preceding assistant response.
2. Distill it into a capture (not the raw response — extract the core knowledge).
3. Good for explanations, code patterns, or answers worth saving.
4. Set `mode: "range"`.

**Example:**
```
User: /capture-this
Agent: I'd capture my last response as:
       [pattern] "Reciprocal Rank Fusion scoring with temporal decay"
       Save? [y/n]
```

### `/capture-search [query]`

Quick search shortcut — just calls `brainos_search` and shows top 5 results with title + date + preview. Useful for checking if something already exists before creating a new capture.

### `/capture-status`

Show active state:
- Any open range captures (topic + how long ago they started).
- If no ranges are active, say so.

### `/capture-add [id]`

Append new content to an existing capture.

1. If no ID given, show recent captures and ask which one.
2. Ask "What to add?" (or accept inline: `/capture-add 2026-06-25-001 we found a second root cause`)
3. Format the addition as a `## Follow-up` or `## Update` section.
4. Call `brainos_append` with the capture ID and the new section.

**Example:**
```
User: /capture-add 2026-06-25-001
Agent: What to add?
User: we found a second root cause — the null check in getPlaceholderCount
Agent: Appended "## Follow-up" section to "Flaky CI test — race condition..."
```

### `/capture-update [id]`

Update metadata on an existing capture without changing the body.

1. If no ID given, show recent captures and ask which one.
2. Ask what to change (or accept inline: `/capture-update 2026-06-25-001 status: resolved, add tag: merged`)
3. Call `brainos_update` with the appropriate fields.

Supported fields: `status` (active/archived/resolved), `summary`, `add_tags`, `remove_tags`.

**Example:**
```
User: /capture-update 2026-06-25-001
Agent: What to update?
User: status: resolved, add tag: merged-to-release
Agent: Updated: status → resolved, added tag "merged-to-release"
```

### `/capture-session`

Scan the entire session for capture-worthy knowledge, propose grouping, then create.

1. **Scan** the full conversation for:
   - Decisions made and their rationale
   - Debugging insights (root cause analysis, dead ends that taught something)
   - Patterns, gotchas, or workarounds
   - Architecture choices with trade-offs
   - Skip: routine edits, formatting, trivial fixes, boilerplate
2. **List** what you found:
   ```
   I found 4 capture-worthy items:
   (a) Decided to use SQLite WAL mode for concurrent access
   (b) Debugged the null pointer in webhook handler — source category lookup was wrong
   (c) Discovered Tauri v2 requires PascalCase for titleBarStyle
   (d) The webhook NPE and the source category issue are the same root cause
   ```
3. **Propose grouping** (apply Consolidation Rules):
   ```
   I'd group these as 2 captures:
   1. [decision] "SQLite WAL mode for concurrent Tauri + MCP access" — item (a)
   2. [bug-fix] "WhatsApp broadcast status NPE — source category from webhook not DB lookup" — items (b) + (d), with (c) as a Key Detail
   
   Adjust?
   ```
4. Wait for user to approve, adjust, or drop items.
5. **Draft** each capture (title, type, tags, summary, body preview). Show all drafts at once.
6. On confirmation, run `brainos_check_duplicate` for each → `brainos_capture` with `mode: "post-hoc"` → `brainos_link` between related captures.

### `/capture-link [id1] [id2]`

Link two captures as related (bidirectional).

1. Call `brainos_link` with both IDs.
2. Confirm: "Linked {title1} ↔ {title2}"

If only one ID is given, show recent captures to pick the second.

---

## Consolidation Rules

### Core Principle
**One logical unit of work = one file.** Not one atomic concept.

### When to Merge vs. Split

| Scenario | Action |
|---|---|
| Bug fix with debugging gotchas | ONE capture — gotchas as `##` sections within the fix narrative |
| Two completely unrelated learnings in one session | TWO captures — separate topics get separate files |
| Architecture decision with trade-off analysis | ONE capture — trade-offs belong with the decision |
| Long debugging session with multiple dead ends | ONE capture — the dead ends are context for the eventual fix |
| Working on two features in one session | TWO captures — one per feature, even if same session |

### Grouping Proposal

When capturing multiple things from a session, **propose the grouping first**:

1. Scan the session for capture-worthy items.
2. Propose: "I'd group these into 2 captures: (A) the bug fix story, (B) the git gotcha. Sound right?"
3. Let the user adjust before generating.
4. This prevents both over-splitting (10 tiny captures) and over-merging (one giant dump).

---

## Body Template

```markdown
## Context
What was happening. What project, what task, what triggered this.

## Problem / Decision
What was the issue or what choice was made.

## Rationale
Why this approach was chosen. What alternatives were considered.
What trade-offs were accepted.

## Outcome
What happened. What was the result. Any follow-up needed.

## Key Details
- Specific code, commands, config, or steps worth remembering
- Error messages or stack traces if relevant
```

Not every section is needed — use the ones that fit. A quick learning might just be Context + Key Details. A decision needs Rationale.

## Quality Rules

- **Title**: Specific enough to find via search. Bad: "Bug fix". Good: "WhatsApp broadcast status telemetry NPE — source category from webhook not DB lookup"
- **Tags**: Lowercase, hyphenated, 2-5 per capture. Use existing tags from the KB when possible (`brainos_stats` shows top tags).
- **Project**: Always set when working in a project context.
- **Don't over-capture**: Not every conversation needs a capture. Capture decisions, non-obvious solutions, debugging insights, architecture choices. Skip routine code changes.
- **Link related captures**: If this capture relates to a previous one, mention the ID in the body with `[[capture-id]]` syntax.

## Setup

Add to Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "brainos": {
      "command": "brainos-mcp",
      "args": ["--allow-write"]
    }
  }
}
```

For read-only access (no capture creation), omit `--allow-write`.
