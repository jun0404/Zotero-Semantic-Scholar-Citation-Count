# Semantic Scholar Citations for Zotero

Fetches citation counts from Semantic Scholar and stores them in the **Extra** field of your Zotero items.

## Compatibility

- **Zotero 8.0 – 9.0.\*** (built on Firefox 140 ESR)
- For Zotero 7, use the `3.0.0` release.

## What's new in 4.0.1

- Fixed: menu labels were not rendering because the bundled `locale/`
  directory was never registered with the addon manager. The plugin now
  calls `amIAddonManagerStartup.registerChrome` at startup so
  `MozXULElement.insertFTLIfNeeded` can find the Fluent file.
- Items context-menu action now reads the items directly from the
  MenuManager context object (instead of re-reading the pane selection),
  which matches the pattern used by other Zotero 8/9 plugins.

## What's new in 4.0.0

- Updated for **Zotero 9** compatibility.
- Migrated menu registration from per-window XUL DOM injection to the
  official `Zotero.MenuManager` API (Zotero 8+). Menus are now registered
  once and Zotero handles every main window automatically, including
  cleanup on plugin disable/uninstall.
- Localized menu labels via Fluent (`locale/en-US/semantic-scholar-citations.ftl`),
  which is required by MenuManager.
- Keyboard shortcut binding switched to `accel+shift+C` so it follows the
  platform conventions (Ctrl on Win/Linux, Cmd on macOS).
- Removed reliance on patterns that are deprecated under Firefox 140 ESR
  (manual `Services.jsm` imports, Bluebird-only promise helpers, etc.).

## Features

- Lookup by DOI, arXiv ID, or title search (with automatic fallback)
- Batch update for selected items or entire library
- Right-click context menu entry, Tools menu entries, and a keyboard
  shortcut (Ctrl/Cmd+Shift+C)
- Rate-limited API requests to stay within Semantic Scholar limits

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Plugin manifest (version, Zotero compatibility, metadata) |
| `bootstrap.js` | All plugin logic in a single bootstrapped file |
| `locale/en-US/semantic-scholar-citations.ftl` | Fluent localization for menu labels |
| `update.json` | Auto-update descriptor referenced from the manifest |

## Build

```bash
zip -r semantic-scholar-citations-4.0.0.xpi \
    manifest.json bootstrap.js update.json locale
```

## Install

1. Open Zotero 8 or 9 and go to **Tools > Plugins** (Tools > Add-ons on older Z8 builds).
2. Click the gear icon and choose **Install Plugin From File...**.
3. Select the `.xpi` file.
4. **Restart Zotero** after installation.

## Usage

After installing and restarting Zotero, you can fetch citation counts in three ways:

### Right-click context menu
1. Select one or more items in your Zotero library.
2. Right-click and choose **Fetch Citation Count**.

### Tools menu
- **Tools > Update Citation Counts (Selected Items)** — updates only highlighted items.
- **Tools > Update All Citation Counts** — updates every item in your library (asks for confirmation first).

### Keyboard shortcut
- **Ctrl+Shift+C** (Windows/Linux) or **Cmd+Shift+C** (macOS) — fetches citation counts for the currently selected items.

### Where results appear

Citation counts are written to the **Extra** field of each item:
```
42 (number of citation counts)
~~~~
```

## Troubleshooting

- **Menus not showing up:** Restart Zotero after installing the `.xpi` file. The MenuManager picks up registrations at plugin load time.
- **Verify the plugin is active:** Go to **Tools > Plugins** and confirm "Semantic Scholar Citations" is listed and enabled.
- **Zotero version:** This plugin requires **Zotero 8.0 – 9.0.\***. For Zotero 7, install the `3.0.0` release.
- **Debug logs:** Open **Help > Debug Output Logging > View Output** and look for lines starting with `Semantic Scholar Citations:` to diagnose issues.
