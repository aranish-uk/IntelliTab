# IntelliTab

AI-powered browser extension that intelligently organizes your tabs into groups, learns your preferences over time, and lets you save/restore entire workspaces.

Built for Chromium-based browsers (Chrome, Brave, Edge, Arc).

---

## Features

### AI Tab Organization

- Click **Analyze Tabs** in the popup to have AI classify your open tabs into logical groups
- Review suggested groups before applying
- Groups are created as native Chromium tab groups with distinct colors
- Option to organize **only ungrouped tabs**, leaving your existing groups untouched
- **Ungroup All** to reset everything

### Adaptive Learning

IntelliTab learns how you prefer your tabs organized through three mechanisms:

| Method | Trigger | Confidence | Description |
|--------|---------|------------|-------------|
| **Passive** | Every 3 hours (automatic) | Low (0.3) | Quietly snapshots your current groups and learns domain-to-group associations |
| **Correction-based** | "Learn from my corrections" button | High (2.0 boost, -0.5 penalty) | After AI organizes tabs, you fix mistakes, then click Learn. IntelliTab diffs the changes, learns correct placements, penalizes wrong ones, and asks AI to suggest SOUL amendments |
| **Explicit** | "This is how I like my tabs" button | High (2.0) | No prior AI run needed. Snapshots your current groups as-is and treats them as your preferred organization |

All learning feeds into a **weighted pattern system** (`domain -> group -> weight`) that the AI uses on future runs. Higher weight = stronger signal.

### SOUL (System of Understanding & Logic)

IntelliTab has an editable "SOUL" — a set of guiding instructions that tell the AI how to think about grouping. The SOUL:

- Defines default group categories and contextual hints
- Gets **automatically amended** when you correct the AI (soft suggestions, not strict rules)
- Is fully editable in the Options page under **Advanced > SOUL Editor**
- Persists across sessions in `chrome.storage.local`

### Workspaces (Group of Groups)

Save your entire tab session as a named workspace and restore it later.

- **Save Workspace** — snapshots all current tab groups (names, colors, URLs) into a named workspace
- **Restore Workspace** — reopens all tabs and recreates all groups
- **Restore Individual Group** — restore just one group from within a workspace
- **Close After Save** — optionally close all tabs after saving
- **Merge vs Fresh** — choose whether to reuse already-open tabs or open fresh ones
- **Delete Workspace** — remove saved workspaces you no longer need

Example use case: save a "Masters" workspace containing groups like Italian, TUM, Edinburgh, UCL, Glasgow, Manchester. Close everything. Restore the whole workspace next week.

### Auto-Recovery

Chromium/Brave does **not reliably persist extension-created tab groups** across browser restarts. This is a known limitation of the `tabGroups` API — the session manager may not capture programmatically created groups the same way it captures user-created ones.

IntelliTab works around this with a **shadow snapshot**:
- After every grouping operation, the current state is auto-saved
- On browser startup, if groups are missing but a snapshot exists, the popup offers one-click restoration

### Rules Engine

Define deterministic domain-to-group mappings that override AI suggestions:

```json
[
  { "id": "1", "type": "group", "pattern": "github.com", "groupName": "Dev" },
  { "id": "2", "type": "group", "pattern": "youtube.com", "groupName": "Entertainment" },
  { "id": "3", "type": "group", "pattern": "canvas", "groupName": "Study" }
]
```

Rules are evaluated before AI classification. Matching tabs are placed directly without asking the AI.

### Group Permissions

Each group category can have a permission level:

| Permission | Behavior |
|------------|----------|
| `editable` | AI can freely move tabs in and out |
| `locked` | AI cannot touch tabs in this group |
| `append_only` | AI can add tabs but cannot remove existing ones |

### Multi-Provider AI Support

IntelliTab works with multiple AI providers. Configure in the Options page:

| Provider | Default Model |
|----------|---------------|
| Groq | `llama-3.3-70b-versatile` |
| OpenAI | `gpt-4o-mini` |
| Google Gemini | `gemini-2.5-flash` |
| Anthropic Claude | `claude-3-5-haiku-latest` |
| OpenRouter | `openai/gpt-3.5-turbo` |
| Custom | Any OpenAI-compatible endpoint |

API keys are stored locally in `chrome.storage.local` and never leave your browser except to call the configured API.

### Feedback Chat

Talk to IntelliTab about its last action via the **Feedback** tab in Options. Tell it things like:
- "YouTube should be in Entertainment, not Dev"
- "Don't create a separate group for just 1 tab"
- "I consider GitHub as Work, not Dev"

The AI will update patterns and potentially amend the SOUL based on your feedback.

---

## Popup Tabs

| Tab | Purpose |
|-----|---------|
| **Organize** | Analyze tabs, review suggestions, apply grouping, ungroup all |
| **Learn** | "Learn from my corrections" (post-AI diff) and "This is how I like my tabs" (snapshot current state) |
| **Spaces** | Save/restore/delete workspaces, auto-recovery banner |
| **Rules** | Edit domain-to-group rule mappings as JSON |

---

## Installation

### From Source

```bash
git clone https://github.com/your-repo/IntelliTab.git
cd IntelliTab
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension:

1. Go to `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

### Development

```bash
npm run dev     # Vite dev server with HMR
npm run build   # Production build (tsc + vite)
npm run zip     # Package dist/ into intellitab.zip
```

---

## Architecture

```
src/
  background.ts          # Service worker: message handling, alarms, grouping logic
  types.ts               # All TypeScript interfaces
  lib/
    aiClient.ts          # AI provider abstraction (classify, feedback, corrections)
    learningEngine.ts    # Pattern storage, passive/active/correction learning
    rulesEngine.ts       # Deterministic domain-to-group rules
    workspaceEngine.ts   # Workspace CRUD, snapshots, tab matching, restoration
  popup/
    Popup.tsx            # Extension popup (Organize, Learn, Spaces, Rules)
  options/
    Options.tsx          # Settings page (Model, Groups, Workspaces, Feedback, Advanced)
```

### Storage Schema

| Key | Type | Description |
|-----|------|-------------|
| `aiConfig` | `AIConfig` | Active AI provider, API key, model, saved configs |
| `rules` | `Rule[]` | Domain-to-group mapping rules |
| `learnedPatterns` | `LearnedPattern` | Weighted domain-to-group associations |
| `soulText` | `string` | SOUL instructions for the AI |
| `lastAction` | `LastAction` | Last AI grouping result + URL-to-group mapping for correction detection |
| `groupConfigs` | `GroupConfig[]` | Group names and permission levels |
| `intellitab_workspaces` | `Workspace[]` | Saved workspaces |
| `intellitab_autosnapshot` | `AutoSnapshot` | Last auto-snapshot for recovery |
| `intellitab_recovery_available` | `boolean` | Flag for recovery banner |

### Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read tab URLs, titles, and group assignments |
| `tabGroups` | Create, update, and query native Chromium tab groups |
| `storage` | Persist settings, patterns, workspaces, and SOUL |
| `alarms` | Periodic passive learning (every 3 hours) |
| `<all_urls>` | Read tab URLs for classification (no content injection) |

---

## Tech Stack

- **TypeScript** — type-safe source code
- **React 18** — popup and options UI
- **Tailwind CSS** — styling
- **Vite** + **@crxjs/vite-plugin** — build tooling with MV3 HMR support
- **Lucide React** — icons
- **Chrome Extensions Manifest V3** — service worker architecture

---

## Known Limitations

- **Brave/Chromium group persistence**: Extension-created tab groups may not survive browser restarts. This is a Chromium session manager limitation, not an IntelliTab bug. The auto-recovery feature mitigates this.
- **Service worker lifecycle**: MV3 service workers can go idle. IntelliTab handles this with robust error responses and catch-all message handling.
- **No cross-window support**: Workspaces and grouping operate on the current/last-focused window only.

---

## Version History

- **2.1.0** — Adaptive learning (passive + corrections + explicit), "Learn" tab, periodic alarms, service worker reliability fixes, catch-all message handler
- **1.3.0** — Workspaces, auto-recovery snapshots, group permissions, stabilization delays
- **1.0.0** — Initial release: AI tab grouping, rules engine, multi-provider support

---

## License

MIT
