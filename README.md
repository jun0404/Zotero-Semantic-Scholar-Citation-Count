# Semantic Scholar Citations for Zotero

Fetches citation counts from Semantic Scholar and stores them in the **Extra** field of your Zotero items.

## Compatibility

- **Zotero 7.0 – 8.0.\*** (built on Firefox 115 / 140 ESR)

## Features

- Lookup by DOI, arXiv ID, or title search (with automatic fallback)
- Batch update for selected items or entire library
- Right-click context menu, Tools menu entries, and keyboard shortcut (Ctrl+Shift+C)
- Rate-limited API requests to stay within Semantic Scholar limits

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Plugin manifest (version, compatibility, metadata) |
| `bootstrap.js` | All plugin logic in a single bootstrapped file |

## Build

```bash
zip semantic-scholar-citations-3.0.0.xpi manifest.json bootstrap.js
```

## Install

1. Open Zotero and go to **Tools > Add-ons**
2. Click the gear icon and choose **Install Add-on From File...**
3. Select the `.xpi` file
4. **Restart Zotero** after installation

## Usage

After installing and restarting Zotero, you can fetch citation counts in three ways:

### Right-click context menu
1. Select one or more items in your Zotero library
2. Right-click and choose **Fetch Citation Count**

### Tools menu
- **Tools > Update Citation Counts (Selected Items)** — updates only highlighted items
- **Tools > Update All Citation Counts** — updates every item in your library (will ask for confirmation first)

### Keyboard shortcut
- **Ctrl+Shift+C** — fetches citation counts for the currently selected items

### Where results appear

Citation counts are written to the **Extra** field of each item:
```
42 (number of citation counts)
~~~~
```

## Troubleshooting

- **Options not showing up:** Restart Zotero after installing the `.xpi` file. The plugin UI only loads when a new main window opens.
- **Verify the plugin is active:** Go to **Tools > Add-ons** and confirm "Semantic Scholar Citations" is listed and enabled. If it shows an error, try removing and reinstalling the `.xpi`.
- **Zotero version:** This plugin requires **Zotero 7.0 – 8.0.\***. Older versions (Zotero 6 and below) are not supported.
- **Debug logs:** Open **Help > Debug Output Logging > View Output** and look for lines starting with `Semantic Scholar Citations:` to diagnose issues.
