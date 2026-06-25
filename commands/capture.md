# /capture — BrainOS Knowledge Capture

You have access to the `brainos_*` MCP tools. Parse the arguments below and run the matching workflow.

**Arguments:** $ARGUMENTS

## Routing

Parse the **first word** of the arguments to decide what to do:

| First word | Action |
|---|---|
| `begin [topic]` | Start a range capture. Acknowledge with the topic, remember the start point. Tell the user to run `/capture end` when done. |
| `end` | End the most recent range capture (or ask which one if multiple are active). Review only the bounded conversation. Draft a capture, show it, and save on confirmation. Use `mode: "range"`. |
| `last N` | Review the last N conversation turns. Distill into a capture draft. Use `mode: "range"`. |
| `this` | Distill the immediately preceding assistant response into a capture draft. Use `mode: "range"`. |
| `session` | Scan the **entire** session for capture-worthy knowledge. Propose grouping (merge related items, split unrelated). Show all drafts. Save on confirmation. Use `mode: "post-hoc"`. |
| `search [query]` | Call `brainos_search` with the rest as the query. Show top 5 results with title, date, and preview. |
| `status` | Show any active range captures (topic + when started). If none, say so. |
| `add [id] [content]` | Append content to an existing capture. If no ID, show recent captures. Format as a `## Follow-up` section. Call `brainos_append`. |
| `update [id] [fields]` | Update metadata on a capture. Parse fields like `status: resolved, add tag: merged`. Call `brainos_update`. |
| `link [id1] [id2]` | Link two captures as related. Call `brainos_link`. If only one ID, show recent captures to pick the second. |
| _(no arguments)_ | Suggest what to do: offer to capture the session, show status, or search. |
| _(free text)_ | Treat as an ad-hoc capture request. Distill the text into a capture draft, show it, and save on confirmation. Use `mode: "post-hoc"`. |

## Rules

1. **Always** call `brainos_check_duplicate` before creating any capture.
2. **Never** save without showing the draft and getting confirmation.
3. Titles must be specific and searchable — not generic like "Bug fix" or "Learning".
4. Use 2–5 lowercase hyphenated tags. Check existing tags via `brainos_stats` if unsure.
5. Set `project` if the session has a clear project context.
6. When creating multiple captures, call `brainos_link` between related ones.
7. Body should follow the template: Context → Problem/Decision → Rationale → Outcome → Key Details. Use only the sections that fit.
