/**
 * Semantic Scholar Citations Plugin for Zotero - Fixed All-in-One Version
 * Combines v1.0 reliability with v2.1 citation format
 * All code in single file for maximum compatibility
 */

var SemanticScholarCitations;

function install() {
    // Installation code
}

function startup({ id, version, rootURI }) {
    Zotero.debug("Semantic Scholar Citations: Starting up v2.1-fixed");
    
    if (!SemanticScholarCitations) {
        SemanticScholarCitations = {
            id: id,
            version: version,
            rootURI: rootURI,
            initialized: false,
            addedElementIDs: [],
            
            // Configuration
            config: {
                apiKey: 'JSUb1fSXJB3uFFYJ5Kw4sauDOc4aerHc4I5uZ916',
                apiBaseUrl: 'https://api.semanticscholar.org/v1/paper/',
                apiBaseUrlV2: 'https://api.semanticscholar.org/graph/v1/paper/',
                rateLimit: 1100, // Slightly over 1 second to be safe
                lastRequestTime: 0,
                citationFormat: 'simple' // Use new simple format
            },
            
            init: async function() {
                if (this.initialized) return;
                
                // Wait for Zotero UI to be ready
                await Zotero.uiReadyPromise;
                
                // Add menu items
                this.addMenuItems();
                
                // Add right-click context menu
                this.addContextMenu();
                
                // Add keyboard shortcuts
                this.addKeyboardShortcuts();
                
                this.initialized = true;
                Zotero.debug("Semantic Scholar Citations: Initialized successfully");
            },
            
            shutdown: function() {
                // Remove added elements
                for (let id of this.addedElementIDs) {
                    let elem = document.getElementById(id);
                    if (elem) elem.remove();
                }
                this.initialized = false;
                Zotero.debug("Semantic Scholar Citations: Shut down");
            },
            
            addMenuItems: function() {
                try {
                    // Add to Tools menu
                    let menuitem = Zotero.getMainWindow().document.createXULElement('menuitem');
                    menuitem.id = 'semantic-scholar-citations-menu';
                    menuitem.setAttribute('label', 'Update Citation Counts (Selected Items)');
                    menuitem.addEventListener('command', () => this.updateSelectedItems());
                    
                    let toolsMenu = Zotero.getMainWindow().document.getElementById('menu_ToolsPopup');
                    if (toolsMenu) {
                        toolsMenu.appendChild(menuitem);
                        this.addedElementIDs.push(menuitem.id);
                    }
                    
                    // Add menu item for updating all items
                    let menuitemAll = Zotero.getMainWindow().document.createXULElement('menuitem');
                    menuitemAll.id = 'semantic-scholar-citations-menu-all';
                    menuitemAll.setAttribute('label', 'Update All Citation Counts');
                    menuitemAll.addEventListener('command', () => this.updateAllItems());
                    
                    if (toolsMenu) {
                        toolsMenu.appendChild(menuitemAll);
                        this.addedElementIDs.push(menuitemAll.id);
                    }
                    
                    Zotero.debug("Semantic Scholar Citations: Menu items added");
                } catch (e) {
                    Zotero.debug("Error adding menu items: " + e);
                }
            },
            
            addContextMenu: function() {
                try {
                    // Add to item context menu
                    let menuitem = Zotero.getMainWindow().document.createXULElement('menuitem');
                    menuitem.id = 'semantic-scholar-citations-context';
                    menuitem.setAttribute('label', 'Fetch Citation Count');
                    menuitem.addEventListener('command', () => this.updateSelectedItems());
                    
                    let menu = Zotero.getMainWindow().document.getElementById('zotero-itemmenu');
                    if (menu) {
                        let sep = Zotero.getMainWindow().document.createXULElement('menuseparator');
                        sep.id = 'semantic-scholar-citations-separator';
                        menu.appendChild(sep);
                        menu.appendChild(menuitem);
                        this.addedElementIDs.push(sep.id);
                        this.addedElementIDs.push(menuitem.id);
                    }
                    
                    Zotero.debug("Semantic Scholar Citations: Context menu added");
                } catch (e) {
                    Zotero.debug("Error adding context menu: " + e);
                }
            },
            
            addKeyboardShortcuts: function() {
                try {
                    // Add Ctrl+Shift+C shortcut
                    const keySet = Zotero.getMainWindow().document.getElementById('mainKeyset');
                    if (keySet) {
                        const key = Zotero.getMainWindow().document.createXULElement('key');
                        key.id = 'semantic-scholar-citations-key';
                        key.setAttribute('key', 'C');
                        key.setAttribute('modifiers', 'control shift');
                        key.addEventListener('command', () => this.updateSelectedItems());
                        keySet.appendChild(key);
                        this.addedElementIDs.push(key.id);
                        
                        Zotero.debug("Semantic Scholar Citations: Keyboard shortcut added");
                    }
                } catch (e) {
                    Zotero.debug("Error adding keyboard shortcuts: " + e);
                }
            },
            
            updateSelectedItems: async function() {
                let items = Zotero.getActiveZoteroPane().getSelectedItems();
                if (items.length === 0) {
                    this.showMessage("No items selected", "Please select one or more items to update.");
                    return;
                }
                
                await this.updateItems(items);
            },
            
            updateAllItems: async function() {
                let libraryID = Zotero.Libraries.userLibraryID;
                let items = await Zotero.Items.getAll(libraryID);
                
                // Filter for actual reference items (not attachments, notes, etc.)
                items = items.filter(item => item.isRegularItem());
                
                if (items.length === 0) {
                    this.showMessage("No items found", "No items found in your library.");
                    return;
                }
                
                let result = Services.prompt.confirm(
                    null,
                    "Update All Items",
                    `This will fetch citation counts for ${items.length} items. This may take ${Math.ceil(items.length * 1.1)} seconds due to rate limiting. Continue?`
                );
                
                if (result) {
                    await this.updateItems(items);
                }
            },
            
            updateItems: async function(items) {
                let progressWindow = this.showProgressWindow(items.length);
                let updated = 0;
                let failed = 0;
                let notFound = 0;
                let skipped = 0;
                
                for (let i = 0; i < items.length; i++) {
                    let item = items[i];
                    
                    if (!item.isRegularItem()) {
                        skipped++;
                        continue;
                    }
                    
                    progressWindow.changeHeadline(`Processing ${i + 1} of ${items.length}`);
                    
                    let title = item.getField('title');
                    if (title) {
                        title = title.substring(0, 50) + (title.length > 50 ? '...' : '');
                        progressWindow.addLines([title]);
                    }
                    
                    try {
                        let result = await this.updateItemCitations(item);
                        if (result === 'updated') {
                            updated++;
                        } else if (result === 'not_found') {
                            notFound++;
                        } else {
                            failed++;
                        }
                    } catch (e) {
                        Zotero.debug("Error updating item: " + e);
                        failed++;
                    }
                    
                    // Rate limiting
                    await this.rateLimitDelay();
                }
                
                progressWindow.close();
                
                this.showMessage(
                    "Update Complete",
                    `Updated: ${updated} items\nNot found: ${notFound} items\nFailed: ${failed} items\nSkipped: ${skipped} items`
                );
            },
            
            updateItemCitations: async function(item) {
                // Get identifiers
                let doi = item.getField('DOI');
                let title = item.getField('title');
                let arxivId = this.extractArxivId(item);
                
                if (!doi && !title && !arxivId) {
                    Zotero.debug("No DOI, title, or arXiv ID for item: " + item.id);
                    return 'failed';
                }
                
                try {
                    // Try to fetch by DOI first, then arXiv, then by title
                    let citationData = null;
                    
                    if (doi) {
                        citationData = await this.fetchCitationsByDOI(doi);
                    }
                    
                    if (!citationData && arxivId) {
                        citationData = await this.fetchCitationsByArxiv(arxivId);
                    }
                    
                    if (!citationData && title) {
                        citationData = await this.fetchCitationsByTitle(title);
                    }
                    
                    if (citationData && citationData.citationCount !== undefined) {
                        // Store citation count using new simple format
                        await this.storeCitationCount(item, citationData.citationCount);
                        return 'updated';
                    }
                    
                    return 'not_found';
                } catch (e) {
                    Zotero.debug("Error fetching citations: " + e);
                    return 'failed';
                }
            },
            
            fetchCitationsByDOI: async function(doi) {
                let url = `${this.config.apiBaseUrlV2}DOI:${encodeURIComponent(doi)}?fields=citationCount,title`;
                return await this.makeAPIRequest(url);
            },
            
            fetchCitationsByArxiv: async function(arxivId) {
                let url = `${this.config.apiBaseUrlV2}ARXIV:${encodeURIComponent(arxivId)}?fields=citationCount,title`;
                return await this.makeAPIRequest(url);
            },
            
            fetchCitationsByTitle: async function(title) {
                // Search by title
                let searchUrl = `${this.config.apiBaseUrlV2}search?query=${encodeURIComponent(title)}&limit=1&fields=citationCount,title,paperId`;
                let searchResult = await this.makeAPIRequest(searchUrl);
                
                if (searchResult && searchResult.data && searchResult.data.length > 0) {
                    return searchResult.data[0];
                }
                
                return null;
            },
            
            makeAPIRequest: async function(url) {
                try {
                    let response = await Zotero.HTTP.request(
                        'GET',
                        url,
                        {
                            headers: {
                                'x-api-key': this.config.apiKey,
                                'Accept': 'application/json'
                            },
                            timeout: 30000,
                            responseType: 'json'
                        }
                    );
                    
                    if (response.status === 200) {
                        return response.response;
                    } else if (response.status === 429) {
                        Zotero.debug("Rate limit exceeded");
                        throw new Error("Rate limit exceeded");
                    } else {
                        Zotero.debug(`API request failed with status ${response.status}`);
                        return null;
                    }
                } catch (e) {
                    Zotero.debug("API request error: " + e);
                    return null;
                }
            },
            
            storeCitationCount: async function(item, citationCount) {
                // Store in Extra field with NEW SIMPLE FORMAT
                let extra = item.getField('extra') || '';
                
                // Remove existing citation count if present (both old and new formats)
                extra = extra.replace(/^\d+\s*\(number of citation counts\)\s*\n?~{4,}\s*\n?/m, '');
                extra = extra.replace(/Semantic Scholar Citations:.*?\n?/g, '');
                
                // Add new citation count in simplified format
                let citationLine = `${citationCount} (number of citation counts)\n~~~~`;
                
                if (extra.trim()) {
                    extra = citationLine + '\n' + extra.trim();
                } else {
                    extra = citationLine;
                }
                
                item.setField('extra', extra);
                await item.saveTx();
                
                Zotero.debug(`Updated citation count for item ${item.id}: ${citationCount}`);
            },
            
            extractArxivId: function(item) {
                const url = item.getField('url') || '';
                const extra = item.getField('extra') || '';
                
                // Check URL
                const urlMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
                if (urlMatch) return urlMatch[1];
                
                // Check extra field
                const extraMatch = extra.match(/arXiv:\s*(\d+\.\d+)/);
                if (extraMatch) return extraMatch[1];
                
                return null;
            },
            
            rateLimitDelay: async function() {
                let now = Date.now();
                let timeSinceLastRequest = now - this.config.lastRequestTime;
                
                if (timeSinceLastRequest < this.config.rateLimit) {
                    let delay = this.config.rateLimit - timeSinceLastRequest;
                    await Zotero.Promise.delay(delay);
                }
                
                this.config.lastRequestTime = Date.now();
            },
            
            showProgressWindow: function(total) {
                let progressWindow = new Zotero.ProgressWindow();
                progressWindow.changeHeadline("Fetching Citation Counts");
                progressWindow.show();
                
                return progressWindow;
            },
            
            showMessage: function(title, message) {
                Services.prompt.alert(null, title, message);
            }
        };
        
        SemanticScholarCitations.init();
    }
}

function shutdown() {
    if (SemanticScholarCitations) {
        SemanticScholarCitations.shutdown();
    }
    SemanticScholarCitations = undefined;
}

function uninstall() {
    // Uninstallation code
}
