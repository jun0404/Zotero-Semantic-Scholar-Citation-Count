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
