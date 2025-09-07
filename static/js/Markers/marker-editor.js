let presetSelectorTemplate = null;

class MarkerEditor {
  // sets up the editor with empty selection tracking and category states
  constructor() {
    this.sessionSelections = new Map();
    this.activeCategory = null;
    this.activeSubcategory = null;
  }

  // opens the preset selector popup and returns selected items when user is done
  async openPresetSelector(popupPoint, existingMarker = null) {
    document.getElementById("preset-popup")?.remove();
    
    const categories = await this.fetchData("/api/categories");
    this.initializeSessionSelections(existingMarker);
    
    const popup = await this.createPopup(popupPoint, categories, existingMarker);
    document.body.appendChild(popup);
    
    this.activeCategory = Object.keys(categories)[0];
    this.activeSubcategory = categories[this.activeCategory]?.[0] || null;
    
    return new Promise(resolve => this.renderInterface(categories, popup, existingMarker, resolve));
  }

  // simple wrapper to fetch JSON data from an API endpoint
  async fetchData(url) {
    return await (await fetch(url)).json();
  }

  // pre-selects items in the editor if editing an existing marker
  initializeSessionSelections(existingMarker) {
    this.sessionSelections.clear();
    existingMarker?.entries?.forEach(categoryGroup => {
      categoryGroup.items?.forEach(item => {
        const key = `${categoryGroup.category}|${categoryGroup.subcategory || ''}|${item.itemname || 'Unknown Item'}`;
        this.sessionSelections.set(key, true);
      });
    });
  }

  // extracts item name from various possible entry formats
  getItemName(entry) {
    return entry.itemname || entry.ref?.item || entry.ref?.NPC || entry.ref?.creature || 
           entry.ref?.object || entry.ref?.name || entry.item || entry.NPC || 
           entry.creature || entry.object || entry.name || "Unknown Item";
  }

  // creates and positions the popup window with template content and settings
  async createPopup(popupPoint, categories, existingMarker) {
    if (!presetSelectorTemplate) {
      presetSelectorTemplate = await (await fetch('/static/templates/preset-selector-template.html')).text();
    }

    const popup = Object.assign(document.createElement('div'), {
      id: 'preset-popup',
      className: 'preset-popup',
      innerHTML: presetSelectorTemplate
    });
    
    const { popupWidth = 800, popupHeight = 550, margin = 20 } = {};
    const { innerWidth, innerHeight } = window;
    const left = Math.max(margin, Math.min(popupPoint.x - popupWidth / 2, innerWidth - popupWidth - margin));
    const top = Math.max(margin, Math.min(popupPoint.y - popupHeight / 2, innerHeight - popupHeight - margin));
    Object.assign(popup.style, { left: `${left}px`, top: `${top}px` });
    
    popup.querySelector('.preset-popup-title').textContent = existingMarker ? "Edit Marker Items" : "Add Items to Marker";
    const nameInput = popup.querySelector('#marker-name-input');
    if (existingMarker?.name) nameInput.value = existingMarker.name;
    if (existingMarker) popup.querySelector('#delete-marker-btn').style.display = 'block';
    
    return popup;
  }

  // sets up the popup interface with tabs and event handlers
  renderInterface(categories, popup, existingMarker, resolve) {
    popup.querySelector('#preset-tabs').innerHTML = Object.keys(categories).map((cat, i) => 
      `<button class="preset-tab ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>`
    ).join("");
    
    this.setupEventHandlers(categories, popup, existingMarker, resolve);
    
    if (this.activeCategory) {
      this.renderSubTabs(this.activeCategory, categories);
      this.renderItems(this.activeCategory, this.activeSubcategory, "", existingMarker);
    }
  }

  // creates the subcategory tabs for the selected main category
  renderSubTabs(category, categories) {
    const subtabs = categories[category] || [];
    const container = document.getElementById("preset-subtabs");
    
    container.innerHTML = subtabs.map((subcat, i) =>
      `<button class="preset-subtab ${i === 0 ? 'active' : ''}" data-subcat="${subcat}">${subcat}</button>`
    ).join("");
    container.style.display = subtabs.length > 0 ? "flex" : "none";
  }

  // generates HTML for a single item checkbox with image and text
  createItemHTML(item, category, subcategory, idx, isGlobalSearch = false) {
    const name = this.getItemName(item);
    const isChecked = this.sessionSelections.get(`${category}|${subcategory || ''}|${name}`) || false;
    const subcatForImg = subcategory || "";
    const displayText = isGlobalSearch 
      ? `${name} - ${subcategory ? `${category} > ${subcategory}` : category}` 
      : name;
    const extraAttrs = isGlobalSearch ? `data-item-name="${name}"` : `data-idx="${idx}"`;

    return `<label class="preset-item">
      <input type="checkbox" data-category="${category}" data-subcategory="${subcatForImg}" ${extraAttrs} ${isChecked ? 'checked' : ''}> 
      <img src="${window.ImageLoader.getImageSrc(category, subcatForImg, item.image)}" alt="${name}" onerror="this.style.display='none'">
      ${displayText}
    </label>`;
  }

  // loads and displays items for the current category/subcategory with optional filtering
  async renderItems(category, subcategory, filter = "", existingMarker = null) {
    try {
      const url = subcategory 
        ? `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`
        : `/api/presets/${encodeURIComponent(category)}`;
      
      let items = await this.fetchData(url);
      
      if (filter) {
        items = items.filter(item => this.getItemName(item).toLowerCase().includes(filter.toLowerCase()));
      }
      
      document.getElementById("preset-list").innerHTML = items.map((item, idx) => 
        this.createItemHTML(item, category, subcategory, idx)
      ).join("");
    } catch (error) {
      console.error("Error fetching presets:", error);
      document.getElementById("preset-list").innerHTML = "<p style='color:#ff6666;'>Error loading items</p>";
    }
  }

  // attaches all click and change event listeners to the popup elements
  setupEventHandlers(categories, popup, existingMarker, resolve) {
    popup.addEventListener('click', async (e) => {
      if (e.target.classList.contains('preset-tab')) {
        await this.handleTabClick(e, categories);
      } else if (e.target.classList.contains('preset-subtab')) {
        await this.handleSubtabClick(e, existingMarker);
      } else if (e.target.id === 'delete-marker-btn') {
        await this.handleDelete(existingMarker, popup, resolve);
      } else if (e.target.id === 'select-presets-ok') {
        await this.handleSave(popup, existingMarker, resolve);
      } else if (e.target.id === 'select-presets-cancel') {
        popup.remove();
        resolve(null);
      }
    });

    popup.addEventListener('change', async (e) => {
      if (e.target.type === 'checkbox' && e.target.dataset.category) {
        await this.handleCheckboxChange(e);
      }
    });

    document.getElementById("preset-search").oninput = (e) => {
      this.handleGlobalSearch(e.target.value, categories, existingMarker);
    };
  }

  // switches to a different category tab and updates the displayed items
  async handleTabClick(e, categories) {
    document.querySelectorAll('.preset-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    this.activeCategory = e.target.dataset.cat;
    this.activeSubcategory = categories[this.activeCategory]?.[0] || null;
    
    this.renderSubTabs(this.activeCategory, categories);
    await this.renderItems(this.activeCategory, this.activeSubcategory, document.getElementById("preset-search").value);
  }

  // switches to a different subcategory tab and refreshes the item list
  async handleSubtabClick(e, existingMarker) {
    document.querySelectorAll('.preset-subtab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    this.activeSubcategory = e.target.dataset.subcat;
    await this.renderItems(this.activeCategory, this.activeSubcategory, document.getElementById("preset-search").value, existingMarker);
  }

  // tracks when user checks/unchecks items by storing their selection state
  async handleCheckboxChange(e) {
    try {
      const { category, subcategory = '', itemName, idx } = e.target.dataset;
      
      let name = itemName;
      if (!name && idx) {
        const url = subcategory 
          ? `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`
          : `/api/presets/${encodeURIComponent(category)}`;
        const items = await this.fetchData(url);
        name = this.getItemName(items[parseInt(idx)]);
      }
      
      if (name) {
        this.sessionSelections.set(`${category}|${subcategory}|${name}`, e.target.checked);
      }
    } catch (error) {
      console.error("Error tracking checkbox change:", error);
    }
  }

  // deletes the marker completely after user confirmation
  async handleDelete(existingMarker, popup, resolve) {
    if (!confirm('Are you sure you want to delete this marker?')) return;
    
    try {
      if (window.NewMarkerFileHandler) {
        await window.NewMarkerFileHandler.deleteMarker(existingMarker);
      } else {
        const mapParam = window.currentMap ? `?map=${encodeURIComponent(window.currentMap)}` : '';
        await fetch(`/api/markers/${existingMarker.id}${mapParam}`, { method: 'DELETE' });
        this.removeMarkerFromMap(existingMarker);
        this.removeMarkerFromGlobals(existingMarker);
        window.updateUI?.();
      }
      
      popup.remove();
      resolve({ deleted: true });
    } catch (error) {
      console.error('Failed to delete marker:', error);
      alert('Failed to delete marker');
    }
  }

  // saves the selected items as marker entries and handles cleanup of removed items
  async handleSave(popup, existingMarker, resolve) {
    const markerName = document.getElementById('marker-name-input')?.value.trim() || '';
    
    const existingItemsMap = new Map();
    const existingItemKeys = new Set();
    
    existingMarker?.entries?.forEach(categoryGroup => {
      categoryGroup.items?.forEach(item => {
        const key = `${categoryGroup.category}|${categoryGroup.subcategory || ''}|${item.itemname}`;
        existingItemsMap.set(key, item.marked || 0);
        
        if (existingMarker.id && item.itemname) {
          const sanitizedName = item.itemname.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
          existingItemKeys.add(`${existingMarker.id}_${sanitizedName}`);
        }
      });
    });
    
    const grouped = new Map();
    const newItemKeys = new Set();
    
    for (const [key, isSelected] of this.sessionSelections) {
      if (isSelected) {
        const [category, subcategory, itemName] = key.split('|');
        const groupKey = `${category}|${subcategory || ''}`;
        
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            category,
            subcategory: subcategory || null,
            items: []
          });
        }
        
        grouped.get(groupKey).items.push({
          itemname: itemName,
          marked: existingItemsMap.get(key) || 0
        });
        
        if (existingMarker?.id && itemName) {
          const sanitizedName = itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
          newItemKeys.add(`${existingMarker.id}_${sanitizedName}`);
        }
      }
    }
    
    if (existingMarker?.id) {
      const removedItemKeys = [...existingItemKeys].filter(key => !newItemKeys.has(key));
      if (removedItemKeys.length > 0) {
        await this.cleanupRemovedItems(removedItemKeys);
      }
    }
    
    popup.remove();
    resolve({ entries: Array.from(grouped.values()), name: markerName });
  }

  // searches across all categories for items matching the search term
  async handleGlobalSearch(searchTerm, categories, existingMarker) {
    if (!searchTerm.trim()) {
      this.renderItems(this.activeCategory, this.activeSubcategory, "", existingMarker);
      return;
    }

    try {
      const allItems = [];
      const searchLower = searchTerm.toLowerCase();

      for (const [category, subcategories] of Object.entries(categories)) {
        const categoriesToSearch = subcategories.length > 0 ? subcategories.map(sub => [category, sub]) : [[category, null]];
        
        for (const [cat, subcat] of categoriesToSearch) {
          try {
            const url = subcat 
              ? `/api/presets/${encodeURIComponent(cat)}/${encodeURIComponent(subcat)}`
              : `/api/presets/${encodeURIComponent(cat)}`;
            const items = await this.fetchData(url);
            
            items.forEach(item => {
              const name = this.getItemName(item);
              if (name.toLowerCase().includes(searchLower)) {
                allItems.push({ item, category: cat, subcategory: subcat, name });
              }
            });
          } catch (error) {
            console.error(`Error fetching items for ${cat}/${subcat || 'no-subcategory'}:`, error);
          }
        }
      }

      const html = allItems.map(itemData => this.createItemHTML(itemData.item, itemData.category, itemData.subcategory, 0, true)).join("");
      document.getElementById("preset-list").innerHTML = html || "<p style='color:#999;'>No items found matching your search.</p>";
    } catch (error) {
      console.error("Error in global search:", error);
      document.getElementById("preset-list").innerHTML = "<p style='color:#ff6666;'>Error searching items</p>";
    }
  }

  // removes a marker from the leaflet map display
  removeMarkerFromMap(existingMarker) {
    if (typeof leafletMap !== 'undefined' && window.leafletMarkers) {
      window.leafletMarkers = window.leafletMarkers.filter(lm => {
        if (lm.markerData?.id === existingMarker.id) {
          leafletMap.removeLayer(lm);
          return false;
        }
        return true;
      });
    }
  }

  // removes a marker from the global markers array
  removeMarkerFromGlobals(existingMarker) {
    if (typeof markers !== 'undefined') {
      const index = markers.findIndex(m => m.id === existingMarker.id);
      if (index !== -1) markers.splice(index, 1);
    }
  }

  // cleans up data files for items that were removed from markers
  async cleanupRemovedItems(removedItemKeys) {
    try {
      if (removedItemKeys.length === 0) return;
      
      let mapPath = window.currentMap;
      if (mapPath && mapPath.includes('.')) {
        const parts = mapPath.split('/');
        parts.pop();
        mapPath = parts.join('/');
      }
      
      mapPath = mapPath.replace(/\\/g, '/');
      
      const response = await fetch(`/api/cleanup-items?map=${encodeURIComponent(mapPath)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemKeys: removedItemKeys
        })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`Successfully cleaned up ${result.cleanedUp.length} items:`, result.cleanedUp);
        
        if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
          for (const itemKey of removedItemKeys) {
            window.InfoBoxSaveLoad.markerItemData.delete(itemKey);
          }
          window.InfoBoxSaveLoad.saveMarkerItemData();
        }
      } else {
        console.warn('Failed to cleanup items:', result.error);
      }
    } catch (error) {
      console.error('Error cleaning up removed items:', error);
    }
  }

  // main editing function that handles both creating and editing markers
  async universalEdit(marker, popupElement = null, parentMarker = null, markerIndex = null) {
    try {
      const position = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const isPinned = popupElement?.classList.contains('popup-pinned');
      
      if (!isPinned && window.markerPopupInstance) {
        window.markerPopupInstance.hide();
      }
      
      const result = await this.openPresetSelector(position, marker);
      
      if (result?.deleted) {
        if (parentMarker && markerIndex !== null) {
          parentMarker.clusterMarkers.splice(markerIndex, 1);
        }
        
        if (window.NewMarkerFileHandler) {
          await window.NewMarkerFileHandler.removeFromMap(marker);
        } else if (window.MarkerDataUtils) {
          window.MarkerDataUtils.removeFromMap(marker);
        }
        
        if (isPinned && window.PopupPinning) {
          window.PopupPinning.getInstance().unpinPopupByElement(popupElement);
        }
        
      } else if (result?.entries) {
        Object.assign(marker, { name: result.name, entries: result.entries });
        
        if (window.NewMarkerFileHandler) {
          await window.NewMarkerFileHandler.saveMarker(marker);
        } else if (window.MarkerDataUtils) {
          await window.MarkerDataUtils.saveMarker(marker);
        }
        
        if (isPinned && window.PopupPinning) {
          await window.PopupPinning.getInstance().refreshPinnedPopup(popupElement, parentMarker || marker);
        }
      }
      
      window.updateUI?.();
      return result;
      
    } catch (error) {
      console.error('Error in universal edit:', error);
      return null;
    }
  }
}

const markerEditor = new MarkerEditor();

// wrapper function that calls the main editing method on the global editor instance
async function universalEdit(marker, popupElement = null, parentMarker = null, markerIndex = null) {
  return markerEditor.universalEdit(marker, popupElement, parentMarker, markerIndex);
}

// wrapper function for opening the preset selector directly
async function openPresetSelector(popupPoint, existingMarker = null) {
  return markerEditor.openPresetSelector(popupPoint, existingMarker);
}

window.markerEditor = markerEditor;
window.universalEdit = universalEdit;