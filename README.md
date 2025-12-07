# Obsidian Tooltip definition

A tooltip plugin for Obsidian that lets you define terms and phrases, then hover over them anywhere in your vault to see their definitions.

![Illustration](illustration.png)

## Features

- **Hover Tooltips**: Hover over any defined term to see its definition in a popover
- **Reverse Lookup**: When hovering a term inside a definition file, see all places where that term is used
- **Markdown Support**: Definitions support full markdown formatting
- **Multiple Definition Files**: Organize definitions into separate files by topic
- **Context Scoping**: Limit which definitions are active for specific notes
- **Visual Indicators**: Definition files are marked with a "DEF" badge in the file explorer

## Quick Start

### 1. Set Up Definition Folder

1. Create a folder in your vault (e.g., `definitions/`)
2. Right-click the folder → Select **Set definition folder**

### 2. Create Definitions

Use the **Add definition** command:
1. Select/highlight a word or phrase in any note
2. Run command: `Add definition`
3. Enter the definition content in the modal
4. Choose which definition file to save it to

### 3. Use Tooltips

Once definitions are added:
- Defined terms will be **underlined with a dotted line**
- **Hover** over any underlined term to see its tooltip
- **Click** the tooltip to navigate to the definition

### 4. Reverse Lookup

When you're inside a definition file and hover over a defined term:
- Instead of showing the definition, it shows **all usages** of that term
- Click any usage to jump directly to that location

## Definition File Types

### Consolidated (Recommended)

One file contains multiple definitions. Register with `def-type: consolidated` in frontmatter.

**Format:**
```markdown
---
def-type: consolidated
---

# Term Name

*optional alias, another alias*

Definition content here. Supports **markdown** formatting.

---

# Another Term

Definition for this term.
```

**Rules:**
- `# Term` - The term being defined (H1 header)
- `*aliases*` - Optional comma-separated aliases in italics
- Content below is the definition (supports markdown)
- `---` - Separates definition blocks

### Atomic

One file = one definition. The filename is the term.

**Format:**
```markdown
---
def-type: atomic
aliases:
  - alias1
  - alias2
---

Definition content here.
```

## Definition Context

By default, all definitions are available everywhere. Use **context** to limit which definitions apply to specific notes.

### Add Context to a Note

1. Open the note you want to scope
2. Run command: `Add definition context`
3. Select the definition file(s) to use

This adds a `def-context` property to your note:
```yaml
---
def-context:
  - definitions/programming.md
  - definitions/math.md
---
```

### Remove Context

Delete the `def-context` property or remove specific file paths from the list.

## Commands

| Command | Description |
|---------|-------------|
| **Add definition** | Create a new definition for selected text |
| **Preview definition** | Show tooltip for term at cursor |
| **Go to definition** | Jump to where the term is defined |
| **Add definition context** | Scope definitions for current note |
| **Register consolidated definition file** | Mark current file as consolidated type |
| **Register atomic definition file** | Mark current file as atomic type |
| **Refresh definitions** | Reload all definitions |

## Settings

- **Definition Folder**: Path to folder containing definition files
- **Hover Preview**: Enable/disable tooltips on hover
- **Popover Delay**: Milliseconds before tooltip appears
- **Hide on Mouse Out**: Auto-hide tooltip when mouse leaves
- **Underline Color**: Customize the underline color for defined terms

## Tips

- Use **consolidated** files to group related definitions (e.g., by topic or project)
- Use **atomic** files for complex definitions that need their own note
- Run **Refresh definitions** if changes aren't appearing
- Right-click menu provides quick access to definition actions