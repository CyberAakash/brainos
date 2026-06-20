# BrainOS v2 — UI Design Specification

## Vision

BrainOS is a **chat-first developer knowledge base**. The UI follows the Cursor/Windsurf pattern — information-dense panels with a chat at the center. Search, browse, and chat are unified into one experience. Every capture is a first-class citizen that can be viewed, edited, tagged, and used as AI context — all without leaving the main screen.

---

## 1. Layout Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  BrainOS     [context chips...]              ⌘K   ☽/☀   ⚙️     │  ← TopBar (h-11)
├────────────┬─────────────────────────────────┬───────────────────┤
│            │                                 │                   │
│  CONTEXT   │         MAIN PANEL              │   DETAIL PANEL    │
│  SIDEBAR   │                                 │                   │
│  (w-64)    │   Chat-first interface          │   Capture viewer  │
│            │   or Browse grid/feed           │   or Editor       │
│  Collaps-  │                                 │   (w-[420px])     │
│  ible      │                                 │                   │
│  ←→        │                                 │   Collapsible     │
│            │                                 │   ←→              │
│            │                                 │                   │
├────────────┴─────────────────────────────────┴───────────────────┤
│  Status: 142 captures · Last synced 2m ago · RAG: Auto          │  ← StatusBar (h-7)
└──────────────────────────────────────────────────────────────────┘
```

### Three-Panel Design

| Panel | Width | Purpose | Collapsible |
|-------|-------|---------|-------------|
| Context Sidebar | 256px (w-64) | Pinned context, auto-suggestions, KB tree | Yes → icon strip (w-12) |
| Main Panel | flex-1 | Chat + browse hybrid | No |
| Detail Panel | 420px | Capture preview / editor | Yes → hidden |

All panels resize smoothly with CSS transitions (200ms ease-out).

---

## 2. TopBar

Height: `h-11` (44px). Slim, dense, no wasted space.

```
┌──────────────────────────────────────────────────────────────────┐
│  🧠 BrainOS   [📝 GC bot flow] [🐛 Worker fix] [+2]   ⌘K  ⚙️  │
└──────────────────────────────────────────────────────────────────┘
```

**Left:** Logo + name (clickable → home)
**Center:** Active context chips (compact pills showing pinned captures). Each chip: type icon + truncated title + × to remove. Overflow: "+N more" chip that opens context panel.
**Right:** ⌘K search trigger, theme toggle (☽/☀), settings gear.

**Micro-animations:**
- Context chips: slide-in from left when added (150ms), fade+shrink when removed (120ms)
- ⌘K button: subtle scale(1.02) on hover, 100ms

---

## 3. Context Sidebar (Left Panel)

The "brain" of the workspace. Shows what context the AI chat has access to.

### Sections (top to bottom):

#### 3a. Context Mode Toggle
```
┌──────────────┐
│ 🟢 Auto RAG  │  ← Toggle switch
│ ○  Manual    │
└──────────────┘
```
- **Auto RAG (default):** Every chat message auto-searches KB, includes top-3 relevant captures. Shows what was auto-included.
- **Manual:** Only pinned captures are used as context.

#### 3b. Pinned Context
```
Pinned Context (3)
┌──────────────────────────┐
│ 📝 GC bot flow restart   │ ×
│ 🐛 Worker DB connection  │ ×
│ 🔧 Redis config fix      │ ×
└──────────────────────────┘
[+ Add capture...]
```
- Drag to reorder
- × to unpin (with shrink animation)
- "+ Add capture" opens inline search (not the full palette)
- Items show: type emoji + title (truncated)

#### 3c. Auto-Suggested (only in Auto RAG mode)
```
Auto-suggested
┌──────────────────────────┐
│ 💡 Event loop patterns   │ + ×
│ 📚 Tokio runtime ref     │ + ×
└──────────────────────────┘
```
- Captures the AI thinks are relevant based on current conversation
- + to pin, × to dismiss
- Faded style (opacity-60) until pinned
- Updates as conversation progresses

#### 3d. Knowledge Base Tree
```
Knowledge Base
├─ 📁 Spaces
│  ├─ work (89)
│  └─ personal (53)
├─ 🏷️ Tags
│  ├─ #rust (24)
│  ├─ #tauri (18)
│  └─ #debugging (15)
├─ 📋 Types
│  ├─ learning (45)
│  ├─ debugging (28)
│  └─ fix (19)
└─ 📂 Projects
   ├─ brainos (12)
   └─ zoho-desk (34)
```
- Clicking a tag/type/space filters the main panel's browse view
- Right-click → Rename, Delete, Change color
- Counts shown as badges
- Collapsible sections

#### 3e. Collapsed State (icon strip)
When collapsed, shows only icons vertically:
```
│📌│  ← Context (with count badge)
│🧠│  ← Auto-suggest
│📁│  ← KB tree
```
Click to expand. Hover shows tooltip.

---

## 4. Main Panel — Chat + Browse Hybrid

This is the core innovation. The main panel has TWO modes that blend together:

### 4a. Home / Idle State

When no conversation is active:

```
                    ┌────────────────────────────┐
                    │                            │
                    │      🧠                    │
                    │   What did you learn       │
                    │      today?                │
                    │                            │
                    │  ┌──────────────────────┐  │
                    │  │ Ask about your KB... │  │
                    │  │              📎 🎤 ↵ │  │
                    │  └──────────────────────┘  │
                    │                            │
                    │  💡 What's the pattern     │
                    │     for error handling?    │
                    │  🔍 Find all debugging     │
                    │     sessions this week    │
                    │  📝 Create a new capture  │
                    │                            │
                    └────────────────────────────┘

        ─── Recent Captures ───────────────────────

        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ 📝      │  │ 🐛      │  │ 🔧      │
        │ GC bot  │  │ Worker  │  │ Redis   │
        │ flow    │  │ DB fix  │  │ config  │
        │         │  │         │  │         │
        │ #rust   │  │ #sql    │  │ #redis  │
        │ 2h ago  │  │ 1d ago  │  │ 2d ago  │
        └─────────┘  └─────────┘  └─────────┘
```

**Chat input:** Centered, rounded-xl, with subtle shadow. Max-width 680px. Has:
- Placeholder text that rotates: "Ask about your KB...", "Search for a capture...", "What would you like to learn?"
- 📎 attach/pin captures button
- ↵ send button (indigo, glows subtly on valid input)

**Suggestion chips:** 3-4 contextual suggestions below input. Click to populate input.

**Recent captures:** Responsive card grid below. Cards are interactive:
- Hover: slight lift (translateY -2px) + shadow increase
- Click: opens in Detail Panel (right)
- Shows: type icon, title, tags (max 2), relative time
- Aspect ratio: roughly 3:4

### 4b. Chat Mode

When user sends a message, the view transitions smoothly:

```
        ┌────────────────────────────────────┐
        │  You                               │
        │  What's the pattern for handling   │
        │  database connections in Rust?     │
        └────────────────────────────────────┘

        ┌────────────────────────────────────┐
        │  BrainOS                    🧠     │
        │                                    │
        │  Based on your captures, here's    │
        │  the pattern you've documented:    │
        │                                    │
        │  ┌──────────────────────────────┐  │
        │  │ 📝 Worker DB connection      │  │  ← Inline capture card
        │  │ Tags: #rust #sqlx            │  │     (clickable → Detail)
        │  │ "Use connection pooling..."  │  │
        │  └──────────────────────────────┘  │
        │                                    │
        │  The key approach is...            │
        │                                    │
        │  📄 Sources: 3 captures used       │  ← Expandable
        └────────────────────────────────────┘

        ┌──────────────────────────────────┐
        │ Ask a follow-up...        📎  ↵  │
        └──────────────────────────────────┘
```

**Chat messages:**
- User messages: right-aligned, indigo-50 bg, rounded
- AI messages: left-aligned, white/zinc-900 bg, full width
- Inline capture cards: embedded in AI responses, clickable
- Sources footer: collapsible, shows which captures were used as context

**Chat input:** Sticks to bottom (sticky), same style as home but full-width within max-w-2xl.

### 4c. Browse Mode

Triggered by: clicking KB tree items, filter chips, or a "Browse" toggle in the top area.

```
        ┌──────────────────────────────────────┐
        │  Captures  │ All ▾ │ Learning ▾ │ +  │  ← Filter bar
        ├──────────────────────────────────────┤
        │                                      │
        │  ┌─────────────────────────────────┐ │
        │  │ 📝 GC bot flow restart          │ │  ← Feed row
        │  │ #rust #gc #tauri · work · 2h    │ │
        │  │ When isAssigneeUpdate fires,    │ │
        │  │ the bot restarts the flow...    │ │
        │  ├─────────────────────────────────┤ │
        │  │ 🐛 Worker DB connection fix     │ │
        │  │ #rust #sqlx · work · 1d         │ │
        │  │ Fixed by increasing pool size   │ │
        │  │ to 10 and adding timeout...     │ │
        │  └─────────────────────────────────┘ │
        │                                      │
        └──────────────────────────────────────┘
```

**Filter bar:** Horizontal pills for space, type, tags, date range. Each is a dropdown. "+" opens New Capture editor.

**Feed rows:** Each capture is a compact card:
- Type icon + Title (bold)
- Tags (indigo chips) + space badge + relative time
- 2-line snippet preview
- Hover: bg change + "Edit | Pin | Delete" action buttons slide in from right
- Click: opens in Detail Panel

**Inline editing:** Tags, type, space can be clicked to edit directly in the feed:
- Click a tag → shows input to add/remove tags
- Click type badge → dropdown to change type
- Click space → toggle work/personal

---

## 5. Detail Panel (Right)

Opens when a capture is selected. Shows full content with edit capabilities.

### 5a. View Mode
```
┌───────────────────────┐
│ ← Back    Edit  ⋮    │  ← Header
├───────────────────────┤
│                       │
│ GC bot flow restart   │  ← Title (editable on click)
│                       │
│ 📋 debugging          │  ← Type (click to change)
│ 🏠 work               │  ← Space (click to toggle)
│ 📅 2 hours ago        │
│ ⭐ high confidence    │  ← Click to change
│                       │
│ Tags:                 │
│ [#rust] [#gc] [+]     │  ← Click to add/remove
│                       │
│ Projects:             │
│ [brainos] [+]         │
│                       │
│ ─────────────────     │
│                       │
│ ## Context            │  ← Rendered markdown
│ When isAssigneeUpdate │
│ fires during a GC bot │
│ conversation...       │
│                       │
│ ```rust               │
│ fn handle_restart() { │
│   // ...              │
│ }                     │
│ ```                   │
│                       │
│ ─────────────────     │
│ Related: [2 captures] │
│ Files: [worker.rs]    │
│                       │
│ [📌 Pin as Context]   │  ← Action button
│ [✏️ Edit Raw]          │
│ [🗑️ Delete]           │
└───────────────────────┘
```

**Inline editing of metadata:**
- **Title:** Click → contenteditable, Enter to save, Esc to cancel
- **Type:** Click badge → dropdown with all types + "Create new type..."
- **Space:** Click → toggle between work/personal
- **Tags:** Shown as pills. Click [+] → input with autocomplete from existing tags. Click × on tag to remove.
- **Confidence:** Click → dropdown (high/medium/low/none)
- **Projects:** Same as tags — pills with add/remove

All metadata changes save immediately (optimistic UI with undo toast).

### 5b. Edit Mode (Raw Markdown)

Triggered by "Edit Raw" button. Same split editor as before:
- Top: metadata summary bar
- Left: monospace textarea
- Right: live preview
- ⌘S to save

---

## 6. ⌘K Command Palette

Same as current implementation but enhanced:

```
┌────────────────────────────────────────────────────┐
│ 🔍 Search captures, commands, actions...           │
├─────────────────────────────────┬──────────────────┤
│                                 │                  │
│  📝 GC bot flow restart        │  ## Context      │
│  🐛 Worker DB connection fix   │  When isAssign…  │
│  🔧 Redis config fix           │                  │
│  💡 Event loop patterns        │  ```rust         │
│                                 │  fn handle()…   │
│  ─── Actions ───                │  ```            │
│  📝 New Capture                 │                  │
│  ⚙️ Settings                    │                  │
│  🔄 Sync Now                   │                  │
│                                 │                  │
├─────────────────────────────────┴──────────────────┤
│  ↑↓ navigate  ↵ open  ⌘↵ pin as context  esc     │
└────────────────────────────────────────────────────┘
```

New addition: `⌘↵` pins the selected capture as context (adds to Context Sidebar).

---

## 7. Micro-Animations

All animations use CSS transitions/animations. No heavy JS animation libraries.

| Element | Trigger | Animation | Duration |
|---------|---------|-----------|----------|
| Buttons | Hover | scale(1.02) + brightness(1.05) | 100ms |
| Buttons | Click | scale(0.97) | 80ms |
| Cards | Hover | translateY(-2px) + shadow-lg | 150ms |
| Context chips | Add | slideInLeft + fadeIn | 150ms |
| Context chips | Remove | scaleX(0) + fadeOut | 120ms |
| Panel collapse | Toggle | width transition | 200ms ease-out |
| Detail panel | Open | slideInRight | 200ms |
| Detail panel | Close | slideOutRight | 150ms |
| Chat messages | Appear | fadeIn + translateY(8px→0) | 200ms |
| Inline edits | Save | brief green flash on field | 300ms |
| Delete | Confirm | item shrinks + fades | 200ms |
| Toast | Appear | slideUp + fadeIn | 150ms |
| Toast | Dismiss | slideDown + fadeOut | 120ms |
| Search results | Load | staggered fadeIn (50ms each) | 50ms×n |
| Type/tag pills | Hover | subtle ring glow | 100ms |
| Toggle switch | Toggle | spring-like slide | 200ms cubic-bezier |
| Status bar dots | Sync | pulse animation | 1s infinite |

---

## 8. Color System

### Light Mode
- **Background:** zinc-50 (main), white (cards/panels)
- **Text:** zinc-900 (primary), zinc-500 (secondary), zinc-400 (muted)
- **Accent:** indigo-600 (primary actions), indigo-50 (selected states)
- **Borders:** zinc-200

### Dark Mode
- **Background:** zinc-950 (main), zinc-900 (cards/panels)
- **Text:** zinc-100 (primary), zinc-400 (secondary), zinc-600 (muted)
- **Accent:** indigo-400 (primary actions), indigo-950 (selected states)
- **Borders:** zinc-800

### Semantic Colors
- **Type badges:** Each type gets a unique color pair:
  - learning: emerald
  - debugging: red
  - fix: amber
  - insight: yellow
  - decision: blue
  - architecture: purple
  - pattern: cyan
  - tool-setup: orange
  - config: slate
  - reference: teal
  - troubleshooting: rose

---

## 9. Component Hierarchy

```
App
├── TopBar
│   ├── Logo
│   ├── ContextChips (active context pills)
│   ├── SearchTrigger (⌘K)
│   ├── ThemeToggle
│   └── SettingsButton
├── PanelLayout (three-panel flex container)
│   ├── ContextSidebar (collapsible left)
│   │   ├── ContextModeToggle
│   │   ├── PinnedContext
│   │   ├── AutoSuggested
│   │   └── KBTree
│   │       ├── SpacesList
│   │       ├── TagsList (with inline CRUD)
│   │       ├── TypesList (with inline CRUD)
│   │       └── ProjectsList
│   ├── MainPanel (flex-1 center)
│   │   ├── HomeView (idle state)
│   │   │   ├── Greeting
│   │   │   ├── ChatInput
│   │   │   ├── SuggestionChips
│   │   │   └── RecentCapturesGrid
│   │   ├── ChatView (active conversation)
│   │   │   ├── MessageList
│   │   │   │   ├── UserMessage
│   │   │   │   └── AIMessage (with InlineCaptureCard)
│   │   │   └── ChatInput (sticky bottom)
│   │   └── BrowseView (filtering/browsing)
│   │       ├── FilterBar
│   │       └── CaptureFeed
│   │           └── CaptureRow (with inline edit)
│   └── DetailPanel (collapsible right)
│       ├── CaptureViewer
│       │   ├── MetadataEditor (inline)
│       │   ├── MarkdownPreview
│       │   └── ActionButtons
│       └── CaptureEditor (raw markdown)
├── CommandPalette (⌘K overlay)
├── StatusBar (bottom)
└── Toasts (overlay)
```

---

## 10. Full CRUD on Tags, Types, Spaces

### Tags Management
- **Create:** Type a new tag name in any tag input → auto-creates
- **Rename:** Right-click tag in KB tree → Rename → updates all captures
- **Delete:** Right-click → Delete → removes from all captures (with confirmation)
- **Bulk edit:** Select multiple captures → "Add tag" / "Remove tag"

### Types Management
- **Available types** are user-configurable (not hardcoded)
- **Create:** Type dropdown has "Create new type..." at bottom
- **Rename:** Right-click in KB tree → Rename
- **Delete:** Right-click → Delete → assigns captures to "uncategorized"
- **Custom icons:** Each type can have a custom emoji icon

### Spaces Management
- **Default:** work, personal
- **Create new spaces:** Settings or KB tree → "Add space"
- **Rename/Delete:** Right-click in KB tree

All CRUD operations update the .md files on disk and re-index.

---

## 11. Context → AI Agent Integration

The context system is designed for portability:

### Export Context
```
[📋 Copy as context] → Copies all pinned captures as formatted text
[📤 Export for Claude] → Generates a CLAUDE.md-compatible context block
[🔗 MCP context] → Makes context available via MCP server
```

### From Chat to Action
When the AI references a capture in chat:
- Capture card has "📌 Pin" button to add to context
- "📋 Copy" button to copy the capture content
- "🔗 Use in..." dropdown → Claude Code, Cursor, etc. (copies appropriate format)

---

## 12. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K | Open command palette |
| ⌘N | New capture |
| ⌘E | Edit selected capture |
| ⌘⌫ | Delete selected capture (with confirm) |
| ⌘B | Toggle context sidebar |
| ⌘⇧B | Toggle detail panel |
| ⌘/ | Focus chat input |
| ⌘1 | Switch to home/chat |
| ⌘2 | Switch to browse |
| Esc | Close overlay / deselect |
| ⌘S | Save (in editor) |

---

## 13. Responsive Behavior

- **≥1400px:** All three panels visible
- **1000-1399px:** Context sidebar collapsed to icon strip, main + detail
- **<1000px:** Only main panel, detail opens as overlay/modal

---

## 14. Creative Touches

1. **Knowledge pulse:** The 🧠 logo subtly pulses when auto-RAG finds relevant context (like a brain "thinking")
2. **Connection lines:** In the greeting, faint animated lines connect between recent capture cards (like a knowledge graph preview)
3. **Smart greeting:** Changes based on time: "Good morning, Aakash", "Late night hacking?", "What did you learn today?"
4. **Capture streak:** Small flame icon 🔥 if you've captured knowledge every day this week
5. **Search ripple:** When ⌘K opens, a subtle ripple animation emanates from the search icon
6. **Context glow:** Pinned context items have a faint indigo glow/border animation when they're being used by the AI
7. **Save confirmation:** When a capture saves, a brief ✓ checkmark draws itself (SVG path animation)
8. **Empty states:** Each empty state has a unique illustration and helpful message
9. **Typing indicator:** When AI is "thinking", show a brain emoji with a thinking animation (dots cycling)

---

## 15. Tech Stack for UI

- **React 19** + TypeScript
- **Tailwind CSS v4** (utility-first, dark mode via class strategy)
- **Framer Motion** or pure CSS for micro-animations
- **marked** + **highlight.js** for markdown rendering
- **Tauri v2** IPC for backend communication
- **Zustand** for global state (context, theme, panel visibility)

---

## Implementation Note

This design should be implemented as a complete rewrite of the frontend components. The Rust backend (Tauri commands, Store, files module) remains unchanged — only the React components and state management change.

Priority order:
1. PanelLayout + TopBar + StatusBar (the shell)
2. MainPanel: HomeView with chat input
3. ContextSidebar with pinned context
4. DetailPanel with inline metadata editing
5. ChatView with message rendering
6. BrowseView with feed + filters
7. CommandPalette enhancements
8. Micro-animations polish
9. Full CRUD on tags/types/spaces
10. Context export features
