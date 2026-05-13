/**
 * Semantic Scholar Citations Plugin for Zotero
 * Compatible with Zotero 8.x and 9.x (Firefox 140 ESR)
 *
 * Menu items are registered through the Zotero 8+ MenuManager API, which
 * handles per-window UI and cleanup automatically. The keyboard shortcut is
 * still added per main window through the bootstrap window hooks because
 * MenuManager does not (yet) expose keyset registration.
 */

var SemanticScholarCitations;

const FTL_FILE = "semantic-scholar-citations.ftl";

// ---------------------------------------------------------------------------
// Bootstrap lifecycle
// ---------------------------------------------------------------------------

function install() {
    Zotero.debug("Semantic Scholar Citations: install");
}

async function startup({ id, version, rootURI }) {
    await Zotero.initializationPromise;

    Zotero.debug("Semantic Scholar Citations: startup v4.0.0");

    SemanticScholarCitations = {
        id,
        version,
        rootURI,
        pluginID: id,

        // Handles returned by MenuManager.registerMenu so we can force
        // cleanup during dev reloads. MenuManager normally cleans up on
        // plugin disable/uninstall via pluginID matching.
        registeredMenus: [],

        // Track per-window keyset elements so we can remove them on unload.
        windowKeyIDs: new Map(),

        // ---- Configuration ------------------------------------------------
        config: {
            apiKey: "JSUb1fSXJB3uFFYJ5Kw4sauDOc4aerHc4I5uZ916",
            apiBaseUrlV2:
                "https://api.semanticscholar.org/graph/v1/paper/",
            rateLimit: 1100,
            lastRequestTime: 0,
        },

        // ---- Menu registration (Zotero 8+) --------------------------------

        registerMenus() {
            try {
                const toolsId = Zotero.MenuManager.registerMenu({
                    menuID: "semantic-scholar-tools-menu",
                    pluginID: this.pluginID,
                    target: "main/menubar/tools",
                    menus: [
                        {
                            menuType: "menuitem",
                            l10nID: "semantic-scholar-update-selected",
                            onCommand: () =>
                                this.updateSelectedItems(
                                    this.getActiveWindow()
                                ),
                        },
                        {
                            menuType: "menuitem",
                            l10nID: "semantic-scholar-update-all",
                            onCommand: () =>
                                this.updateAllItems(this.getActiveWindow()),
                        },
                    ],
                });

                const itemsId = Zotero.MenuManager.registerMenu({
                    menuID: "semantic-scholar-items-menu",
                    pluginID: this.pluginID,
                    target: "main/library/item",
                    menus: [
                        {
                            menuType: "menuitem",
                            l10nID: "semantic-scholar-fetch-context",
                            onShowing: (_event, context) => {
                                const items = context?.items ?? [];
                                const visible = items.some((it) =>
                                    it?.isRegularItem?.()
                                );
                                context?.setVisible?.(visible);
                            },
                            onCommand: () =>
                                this.updateSelectedItems(
                                    this.getActiveWindow()
                                ),
                        },
                    ],
                });

                this.registeredMenus = [toolsId, itemsId].filter(Boolean);
                Zotero.debug(
                    "Semantic Scholar Citations: registered MenuManager menus"
                );
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: menu registration failed – " +
                        e
                );
            }
        },

        unregisterMenus() {
            for (const handle of this.registeredMenus) {
                try {
                    if (typeof handle === "string") {
                        Zotero.MenuManager.unregisterMenu(handle);
                    } else if (handle && typeof handle.unregister === "function") {
                        handle.unregister();
                    }
                } catch (e) {
                    /* ignore */
                }
            }
            this.registeredMenus = [];
        },

        // ---- Per-window UI (keyboard shortcut + FTL) ----------------------

        insertFTL(window) {
            try {
                if (window?.MozXULElement?.insertFTLIfNeeded) {
                    window.MozXULElement.insertFTLIfNeeded(FTL_FILE);
                }
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: FTL insert error – " + e
                );
            }
        },

        addKeyboardShortcut(window) {
            try {
                const doc = window.document;
                const keySet = doc.getElementById("mainKeyset");
                if (!keySet) return;
                if (doc.getElementById("semantic-scholar-citations-key")) {
                    return;
                }

                const key = doc.createXULElement("key");
                key.id = "semantic-scholar-citations-key";
                key.setAttribute("key", "C");
                key.setAttribute("modifiers", "accel,shift");
                key.addEventListener("command", () =>
                    this.updateSelectedItems(window)
                );
                keySet.appendChild(key);
                this.windowKeyIDs.set(
                    window,
                    "semantic-scholar-citations-key"
                );
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: keyset error – " + e
                );
            }
        },

        removeKeyboardShortcut(window) {
            const id = this.windowKeyIDs.get(window);
            if (!id) return;
            try {
                const el = window.document.getElementById(id);
                if (el) el.remove();
            } catch (e) {
                /* ignore */
            }
            this.windowKeyIDs.delete(window);
        },

        getActiveWindow() {
            if (typeof Zotero.getMainWindow === "function") {
                const w = Zotero.getMainWindow();
                if (w) return w;
            }
            const windows = Zotero.getMainWindows();
            return windows && windows.length ? windows[0] : null;
        },

        // ---- Actions ------------------------------------------------------

        async updateSelectedItems(window) {
            const zoteroPane = Zotero.getActiveZoteroPane();
            const items = zoteroPane ? zoteroPane.getSelectedItems() : [];
            if (items.length === 0) {
                this.showAlert(
                    window,
                    "No items selected",
                    "Please select one or more items to update."
                );
                return;
            }
            await this.updateItems(items, window);
        },

        async updateAllItems(window) {
            const libraryID = Zotero.Libraries.userLibraryID;
            let items = await Zotero.Items.getAll(libraryID);
            items = items.filter((item) => item.isRegularItem());

            if (items.length === 0) {
                this.showAlert(
                    window,
                    "No items found",
                    "No items found in your library."
                );
                return;
            }

            const ok = Services.prompt.confirm(
                window,
                "Update All Items",
                `This will fetch citation counts for ${items.length} items. ` +
                    `This may take about ${Math.ceil(items.length * 1.1)} ` +
                    `seconds due to rate limiting. Continue?`
            );

            if (ok) {
                await this.updateItems(items, window);
            }
        },

        async updateItems(items, window) {
            const progressWindow = new Zotero.ProgressWindow();
            progressWindow.changeHeadline("Fetching Citation Counts");
            progressWindow.show();

            let updated = 0;
            let failed = 0;
            let notFound = 0;
            let skipped = 0;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                if (!item.isRegularItem()) {
                    skipped++;
                    continue;
                }

                progressWindow.changeHeadline(
                    `Processing ${i + 1} of ${items.length}`
                );

                let title = item.getField("title");
                if (title) {
                    title =
                        title.substring(0, 50) +
                        (title.length > 50 ? "..." : "");
                    progressWindow.addLines([title]);
                }

                try {
                    const result = await this.updateItemCitations(item);
                    if (result === "updated") {
                        updated++;
                    } else if (result === "not_found") {
                        notFound++;
                    } else {
                        failed++;
                    }
                } catch (e) {
                    Zotero.debug(
                        "Semantic Scholar Citations: error updating item – " +
                            e
                    );
                    failed++;
                }

                await this.rateLimitDelay();
            }

            progressWindow.close();

            this.showAlert(
                window,
                "Update Complete",
                `Updated: ${updated} items\n` +
                    `Not found: ${notFound} items\n` +
                    `Failed: ${failed} items\n` +
                    `Skipped: ${skipped} items`
            );
        },

        // ---- Citation fetching --------------------------------------------

        async updateItemCitations(item) {
            const doi = item.getField("DOI");
            const title = item.getField("title");
            const arxivId = this.extractArxivId(item);

            if (!doi && !title && !arxivId) {
                Zotero.debug(
                    "Semantic Scholar Citations: no identifiers for item " +
                        item.id
                );
                return "failed";
            }

            try {
                let data = null;

                if (doi) {
                    data = await this.fetchCitationsByDOI(doi);
                }
                if (!data && arxivId) {
                    data = await this.fetchCitationsByArxiv(arxivId);
                }
                if (!data && title) {
                    data = await this.fetchCitationsByTitle(title);
                }

                if (data && data.citationCount !== undefined) {
                    await this.storeCitationCount(item, data.citationCount);
                    return "updated";
                }
                return "not_found";
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: fetch error – " + e
                );
                return "failed";
            }
        },

        async fetchCitationsByDOI(doi) {
            const url =
                `${this.config.apiBaseUrlV2}DOI:${encodeURIComponent(doi)}` +
                `?fields=citationCount,title`;
            return this.makeAPIRequest(url);
        },

        async fetchCitationsByArxiv(arxivId) {
            const url =
                `${this.config.apiBaseUrlV2}ARXIV:${encodeURIComponent(arxivId)}` +
                `?fields=citationCount,title`;
            return this.makeAPIRequest(url);
        },

        async fetchCitationsByTitle(title) {
            const url =
                `${this.config.apiBaseUrlV2}search` +
                `?query=${encodeURIComponent(title)}` +
                `&limit=1&fields=citationCount,title,paperId`;
            const result = await this.makeAPIRequest(url);
            if (result && result.data && result.data.length > 0) {
                return result.data[0];
            }
            return null;
        },

        async makeAPIRequest(url) {
            try {
                const response = await Zotero.HTTP.request("GET", url, {
                    headers: {
                        "x-api-key": this.config.apiKey,
                        Accept: "application/json",
                    },
                    timeout: 30000,
                    responseType: "json",
                });

                if (response.status === 200) {
                    return response.response;
                }
                if (response.status === 429) {
                    Zotero.debug(
                        "Semantic Scholar Citations: rate-limit hit (429)"
                    );
                    throw new Error("Rate limit exceeded");
                }
                Zotero.debug(
                    "Semantic Scholar Citations: API " + response.status
                );
                return null;
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: request error – " + e
                );
                return null;
            }
        },

        // ---- Storage ------------------------------------------------------

        async storeCitationCount(item, citationCount) {
            let extra = item.getField("extra") || "";

            extra = extra.replace(
                /^\d+\s*\(number of citation counts\)\s*\n?~{4,}\s*\n?/m,
                ""
            );
            extra = extra.replace(/Semantic Scholar Citations:.*?\n?/g, "");

            const line = `${citationCount} (number of citation counts)\n~~~~`;
            extra = extra.trim() ? line + "\n" + extra.trim() : line;

            item.setField("extra", extra);
            await item.saveTx();

            Zotero.debug(
                `Semantic Scholar Citations: item ${item.id} → ${citationCount}`
            );
        },

        // ---- Helpers ------------------------------------------------------

        extractArxivId(item) {
            const url = item.getField("url") || "";
            const extra = item.getField("extra") || "";

            const urlMatch = url.match(
                /arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/
            );
            if (urlMatch) return urlMatch[1];

            const extraMatch = extra.match(/arXiv:\s*(\d+\.\d+)/);
            if (extraMatch) return extraMatch[1];

            return null;
        },

        async rateLimitDelay() {
            const now = Date.now();
            const elapsed = now - this.config.lastRequestTime;
            if (elapsed < this.config.rateLimit) {
                const delay = this.config.rateLimit - elapsed;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            this.config.lastRequestTime = Date.now();
        },

        showAlert(window, title, message) {
            try {
                Services.prompt.alert(
                    window || this.getActiveWindow(),
                    title,
                    message
                );
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: alert error – " + e
                );
            }
        },
    };

    // Register menus once for the lifetime of the plugin.
    SemanticScholarCitations.registerMenus();

    // Inject FTL and keyboard shortcut into any windows already open.
    for (const win of Zotero.getMainWindows()) {
        if (win.ZoteroPane) {
            SemanticScholarCitations.insertFTL(win);
            SemanticScholarCitations.addKeyboardShortcut(win);
        }
    }
}

// Called each time a main Zotero window opens (Zotero 7+).
function onMainWindowLoad({ window }) {
    if (SemanticScholarCitations) {
        SemanticScholarCitations.insertFTL(window);
        SemanticScholarCitations.addKeyboardShortcut(window);
    }
}

// Called each time a main Zotero window closes (Zotero 7+).
function onMainWindowUnload({ window }) {
    if (SemanticScholarCitations) {
        SemanticScholarCitations.removeKeyboardShortcut(window);
    }
}

function shutdown() {
    Zotero.debug("Semantic Scholar Citations: shutdown");
    if (SemanticScholarCitations) {
        SemanticScholarCitations.unregisterMenus();
        try {
            for (const win of Zotero.getMainWindows()) {
                SemanticScholarCitations.removeKeyboardShortcut(win);
            }
        } catch (e) {
            /* ignore */
        }
    }
    SemanticScholarCitations = undefined;
}

function uninstall() {
    Zotero.debug("Semantic Scholar Citations: uninstall");
}
