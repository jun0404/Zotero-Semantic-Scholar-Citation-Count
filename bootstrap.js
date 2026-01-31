/**
 * Semantic Scholar Citations Plugin for Zotero
 * Compatible with Zotero 7.x and 8.x (Firefox 115 / 140 ESR)
 *
 * Uses the official bootstrapped plugin pattern with
 * onMainWindowLoad / onMainWindowUnload hooks for per-window UI.
 */

var SemanticScholarCitations;

// ---------------------------------------------------------------------------
// Bootstrap lifecycle
// ---------------------------------------------------------------------------

function install() {
    Zotero.debug("Semantic Scholar Citations: install");
}

function startup({ id, version, rootURI }) {
    Zotero.debug("Semantic Scholar Citations: startup v3.0.0");

    SemanticScholarCitations = {
        id,
        version,
        rootURI,

        // ---- Configuration ------------------------------------------------
        config: {
            apiKey: "JSUb1fSXJB3uFFYJ5Kw4sauDOc4aerHc4I5uZ916",
            apiBaseUrlV2:
                "https://api.semanticscholar.org/graph/v1/paper/",
            rateLimit: 1100,
            lastRequestTime: 0,
        },

        // Track elements added per-window so we can clean up properly
        windowElementIDs: new Map(), // window -> [id, ...]

        // ---- Per-window UI ------------------------------------------------

        addToWindow(window) {
            const doc = window.document;
            const ids = [];

            try {
                // --- Tools menu items ---
                const toolsMenu = doc.getElementById("menu_ToolsPopup");
                if (toolsMenu) {
                    const menuitem = doc.createXULElement("menuitem");
                    menuitem.id = "semantic-scholar-citations-menu";
                    menuitem.setAttribute(
                        "label",
                        "Update Citation Counts (Selected Items)"
                    );
                    menuitem.addEventListener("command", () =>
                        this.updateSelectedItems(window)
                    );
                    toolsMenu.appendChild(menuitem);
                    ids.push(menuitem.id);

                    const menuitemAll = doc.createXULElement("menuitem");
                    menuitemAll.id = "semantic-scholar-citations-menu-all";
                    menuitemAll.setAttribute(
                        "label",
                        "Update All Citation Counts"
                    );
                    menuitemAll.addEventListener("command", () =>
                        this.updateAllItems(window)
                    );
                    toolsMenu.appendChild(menuitemAll);
                    ids.push(menuitemAll.id);
                }

                // --- Item context menu ---
                const itemMenu = doc.getElementById("zotero-itemmenu");
                if (itemMenu) {
                    const sep = doc.createXULElement("menuseparator");
                    sep.id = "semantic-scholar-citations-separator";
                    itemMenu.appendChild(sep);
                    ids.push(sep.id);

                    const ctxItem = doc.createXULElement("menuitem");
                    ctxItem.id = "semantic-scholar-citations-context";
                    ctxItem.setAttribute("label", "Fetch Citation Count");
                    ctxItem.addEventListener("command", () =>
                        this.updateSelectedItems(window)
                    );
                    itemMenu.appendChild(ctxItem);
                    ids.push(ctxItem.id);
                }

                // --- Keyboard shortcut (Ctrl+Shift+C) ---
                const keySet = doc.getElementById("mainKeyset");
                if (keySet) {
                    const key = doc.createXULElement("key");
                    key.id = "semantic-scholar-citations-key";
                    key.setAttribute("key", "C");
                    key.setAttribute("modifiers", "control shift");
                    key.addEventListener("command", () =>
                        this.updateSelectedItems(window)
                    );
                    keySet.appendChild(key);
                    ids.push(key.id);
                }

                Zotero.debug(
                    "Semantic Scholar Citations: UI added to window"
                );
            } catch (e) {
                Zotero.debug(
                    "Semantic Scholar Citations: error adding UI – " + e
                );
            }

            this.windowElementIDs.set(window, ids);
        },

        removeFromWindow(window) {
            const doc = window.document;
            const ids = this.windowElementIDs.get(window) || [];
            for (const id of ids) {
                const el = doc.getElementById(id);
                if (el) el.remove();
            }
            this.windowElementIDs.delete(window);
            Zotero.debug(
                "Semantic Scholar Citations: UI removed from window"
            );
        },

        removeFromAllWindows() {
            for (const window of this.windowElementIDs.keys()) {
                this.removeFromWindow(window);
            }
        },

        // ---- Actions ------------------------------------------------------

        async updateSelectedItems(window) {
            const zoteroPane = Zotero.getActiveZoteroPane();
            const items = zoteroPane.getSelectedItems();
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

            // Strip previous citation count lines (both old & new formats)
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
            Services.prompt.alert(window, title, message);
        },
    };
}

// Called each time a main Zotero window opens (Zotero 7+)
function onMainWindowLoad({ window }) {
    if (SemanticScholarCitations) {
        SemanticScholarCitations.addToWindow(window);
    }
}

// Called each time a main Zotero window closes (Zotero 7+)
function onMainWindowUnload({ window }) {
    if (SemanticScholarCitations) {
        SemanticScholarCitations.removeFromWindow(window);
    }
}

function shutdown() {
    Zotero.debug("Semantic Scholar Citations: shutdown");
    if (SemanticScholarCitations) {
        SemanticScholarCitations.removeFromAllWindows();
    }
    SemanticScholarCitations = undefined;
}

function uninstall() {
    Zotero.debug("Semantic Scholar Citations: uninstall");
}
