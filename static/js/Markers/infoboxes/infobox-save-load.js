class InfoBoxSaveLoad {
  // Sets up empty data storage and tracking variables
  constructor() {
    this.markerItemData = new Map();
    this.mapDataCache = new Map();
    this.initialized = false;
  }

  // Starts up the system by loading data and migrating old storage
  async init() {
    if (this.initialized) return;
    try {
      await this.loadMarkerItemData();
      await this.migrateFromLocalStorage();
      this.initialized = true;
      console.log('InfoBoxSaveLoad initialized successfully');
    } catch (error) {
      console.error('Failed to initialize InfoBoxSaveLoad:', error);
    }
  }

  // Loads item data for the current map from cache or fetches from server
  async loadMarkerItemData() {
    try {
      this.markerItemData.clear();
      if (!window.currentMap) {
        console.log('No current map, skipping marker item data load');
        return;
      }

      if (this.mapDataCache.has(window.currentMap)) {
        this.markerItemData = new Map(this.mapDataCache.get(window.currentMap));
        console.log(`Loaded marker item data from cache for map: ${window.currentMap}`);
        return;
      }

      const response = await fetch(`/api/item-details?map=${encodeURIComponent(window.currentMap)}`);
      if (response.ok) {
        const data = await response.json();
        this.markerItemData = new Map(Object.entries(data));
        this.mapDataCache.set(window.currentMap, new Map(this.markerItemData));
        console.log(`Loaded marker item data from server for map: ${window.currentMap}`);
      } else {
        console.warn(`Could not load marker item data from server for map: ${window.currentMap}`);
      }
    } catch (error) {
      console.warn('Could not load marker item data:', error);
    }
  }

  // Fetches and caches item data for any specific map
  async loadItemDataForMap(mapName) {
    try {
      if (this.mapDataCache.has(mapName)) {
        console.log(`Using cached item data for map: ${mapName}`);
        return new Map(this.mapDataCache.get(mapName));
      }

      const response = await fetch(`/api/item-details?map=${encodeURIComponent(mapName)}`);
      if (response.ok) {
        const data = await response.json();
        const mapData = new Map(Object.entries(data));
        this.mapDataCache.set(mapName, new Map(mapData));
        console.log(`Loaded and cached item data for map: ${mapName}`);
        return mapData;
      } else {
        console.warn(`Could not load item data for map: ${mapName}`);
        return new Map();
      }
    } catch (error) {
      console.warn(`Could not load item data for map ${mapName}:`, error);
      return new Map();
    }
  }

  // Gets item data for a map, returns current data or fetches it
  async getItemDataForMap(mapName) {
    return !mapName ? new Map() : mapName === window.currentMap ? this.markerItemData : await this.loadItemDataForMap(mapName);
  }

  // Creates new item data if it doesn't exist for a specific map
  async getOrCreateItemDataForMap(itemKey, itemName, mapName) {
    const mapData = await this.getItemDataForMap(mapName);
    if (!mapData.has(itemKey)) {
      const newItemData = { name: itemName, timestamp: Date.now(), customData: {} };
      mapData.set(itemKey, newItemData);
      if (mapName !== window.currentMap) this.mapDataCache.set(mapName, new Map(mapData));
    }
    return mapData.get(itemKey);
  }

  // Temporarily switches to another map's data and returns a function to switch back
  async temporarySwitchToMap(mapName) {
    if (!mapName || mapName === window.currentMap) return null;
    const previousData = new Map(this.markerItemData);
    this.markerItemData = new Map(await this.getItemDataForMap(mapName));
    return () => this.markerItemData = previousData;
  }

  // Saves all current item data to the server
  async saveMarkerItemData() {
    try {
      if (!window.currentMap) {
        console.warn('No current map, cannot save marker item data');
        return;
      }

      const response = await fetch(`/api/item-details?map=${encodeURIComponent(window.currentMap)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(this.markerItemData))
      });
      
      if (response.ok) {
        this.mapDataCache.set(window.currentMap, new Map(this.markerItemData));
        console.log('Marker item data saved to server and cache updated');
      } else {
        console.error('Failed to save marker item data:', await response.json());
      }
    } catch (error) {
      console.error('Could not save marker item data:', error);
    }
  }

  // Moves old data from localStorage to server then cleans up localStorage
  async migrateFromLocalStorage() {
    try {
      const savedData = localStorage.getItem('markerItemData');
      if (savedData && this.markerItemData.size === 0) {
        console.log('Migrating data from localStorage to server...');
        this.markerItemData = new Map(Object.entries(JSON.parse(savedData)));
        await this.saveMarkerItemData();
        localStorage.removeItem('markerItemData');
        console.log('Migration completed successfully');
      }
    } catch (error) {
      console.warn('Could not migrate localStorage data:', error);
    }
  }

  // Gets existing item data or creates new data with default values
  getOrCreateItemData(itemKey, itemName) {
    if (this.markerItemData.has(itemKey)) {
      const existingData = this.markerItemData.get(itemKey);
      console.log('Returning existing item data for:', itemKey, existingData.name);
      return existingData;
    }
    
    let baseData = {};
    if (itemName && window.InfoBoxData?.isReady()) {
      baseData = window.InfoBoxData.getEnhancedItemData(itemName);
      baseData.name = itemName;
    } else {
      console.warn('No item name provided or InfoBoxData not ready, using basic data for key:', itemKey);
      baseData = {
        name: itemName || 'Unknown Item', category: 'Unknown', subcategory: '', wiki: '', location: 'Unknown',
        'Appears in': [], drops: [], Drops: [], harvestableDrops: [], 'Harvestable Drops': [], trades: [], Trade: [],
        Butchering: [], Recipe: '', 'Scrap Result': [], Farming: [], description: 'No detailed information available.',
        image: '', additionalImage: '', customDescription: '', customLocation: '', notes: '',
        infoboxWidth: null, infoboxHeight: null
      };
    }

    this.markerItemData.set(itemKey, baseData);
    this.saveMarkerItemData();
    return baseData;
  }

  // Updates a single field in an item and saves it
  updateItemField(itemKey, fieldName, value) {
    if (!this.markerItemData.has(itemKey)) {
      console.warn('Item not found for update:', itemKey);
      return false;
    }
    const itemData = this.markerItemData.get(itemKey);
    itemData[fieldName] = value;
    this.markerItemData.set(itemKey, itemData);
    this.saveMarkerItemData();
    return true;
  }

  // Updates the infobox size dimensions for an item
  updateItemSize(itemKey, width, height) {
    if (!this.markerItemData.has(itemKey)) {
      console.warn('Item not found for size update:', itemKey);
      return false;
    }
    const itemData = this.markerItemData.get(itemKey);
    itemData.infoboxWidth = width;
    itemData.infoboxHeight = height;
    this.markerItemData.set(itemKey, itemData);
    this.saveMarkerItemData();
    return true;
  }

  // Removes all item data that belongs to a specific marker
  cleanupMarkerData(markerId) {
    const keysToDelete = [...this.markerItemData.keys()].filter(key => key.startsWith(`${markerId}_`));
    keysToDelete.forEach(key => this.markerItemData.delete(key));
    if (keysToDelete.length) {
      this.saveMarkerItemData();
      console.log(`Cleaned up item data for marker ${markerId}`);
    }
  }

  // Syncs marker data by creating missing items and removing old ones
  synchronizeMarkerData(marker) {
    if (!marker?.id || !marker.entries) return;
    
    const currentKeys = new Set();
    marker.entries.forEach(categoryGroup => {
      if (categoryGroup.items?.length) {
        categoryGroup.items.forEach(item => {
          const itemName = item.itemname || item.item || item.name || 'Unknown Item';
          const itemKey = window.InfoBoxData?.createItemKey(marker.id, itemName) || 
                         `${marker.id}_${itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
          currentKeys.add(itemKey);
          if (!this.markerItemData.has(itemKey)) this.getOrCreateItemData(itemKey, itemName);
        });
      }
    });
    
    const keysToDelete = [...this.markerItemData.keys()].filter(key => 
      key.startsWith(`${marker.id}_`) && !currentKeys.has(key)
    );
    keysToDelete.forEach(key => this.markerItemData.delete(key));
    
    if (keysToDelete.length || currentKeys.size) {
      this.saveMarkerItemData();
      console.log(`Synchronized marker ${marker.id}: removed ${keysToDelete.length} old items, ensured ${currentKeys.size} items exist`);
    }
  }

  // Finds and removes item data that doesn't belong to any existing markers
  async cleanupOrphanedData() {
    try {
      const response = await fetch('/api/markers');
      if (!response.ok) {
        console.warn('Could not fetch markers for cleanup');
        return 0;
      }
      
      const markers = await response.json();
      const validKeys = new Set();
      
      markers.forEach(marker => {
        if (marker.entries) {
          marker.entries.forEach(categoryGroup => {
            if (categoryGroup.items?.length) {
              categoryGroup.items.forEach(item => {
                const itemName = item.itemname || item.item || item.name || 'Unknown Item';
                const itemKey = window.InfoBoxData?.createItemKey(marker.id, itemName) || 
                               `${marker.id}_${itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
                validKeys.add(itemKey);
              });
            }
          });
        }
      });
      
      const keysToDelete = [...this.markerItemData.keys()].filter(key => !validKeys.has(key));
      keysToDelete.forEach(key => this.markerItemData.delete(key));
      
      if (keysToDelete.length) {
        await this.saveMarkerItemData();
        console.log(`Cleaned up ${keysToDelete.length} orphaned item data entries`);
      } else {
        console.log('No orphaned item data found');
      }
      
      return keysToDelete.length;
    } catch (error) {
      console.error('Error cleaning up orphaned data:', error);
      return 0;
    }
  }

  // Imports marker data from an external source and saves it
  importMarkerData(data) {
    try {
      this.markerItemData = new Map(Object.entries(data));
      this.saveMarkerItemData();
      return true;
    } catch (error) {
      console.error('Failed to import marker data:', error);
      return false;
    }
  }

  getAllMarkerData() { return Object.fromEntries(this.markerItemData); } // Returns all data as a regular object
  clearAllMarkerData() { this.markerItemData.clear(); this.saveMarkerItemData(); } // Wipes all data and saves empty state
  getDataSize() { return this.markerItemData.size; } // Returns how many items are stored
  isReady() { return this.initialized; } // Checks if system is initialized and ready
  getItemData(itemKey) { return this.markerItemData.get(itemKey); } // Gets data for a specific item
  hasItemData(itemKey) { return this.markerItemData.has(itemKey); } // Checks if item data exists
  setItemData(itemKey, data) { this.markerItemData.set(itemKey, data); this.saveMarkerItemData(); } // Sets item data and saves
  removeItemData(itemKey) { // Removes item data and saves if it existed
    const existed = this.markerItemData.delete(itemKey);
    if (existed) this.saveMarkerItemData();
    return existed;
  }

  // Sets up event handlers for restored infoboxes from saved data
  setupRestoredBoxEventHandlers(box, itemKey) {
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.target === box) this.saveRestoredBoxSize(box, itemKey);
        }
      });
      resizeObserver.observe(box);
      box._resizeObserver = resizeObserver;
    }

    const handlers = {
      '.info-close-btn, .popup-close': () => this.closeRestoredBox(box, itemKey),
      '.info-edit-btn': () => this.toggleEditModeForBox(box),
      '.info-pin-btn': () => this.unpinRestoredBox(box, itemKey),
      '.add-image-btn': () => this.getInstanceForBox(box)?.handleAddImage()
    };

    Object.entries(handlers).forEach(([selector, handler]) => {
      const el = box.querySelector(selector);
      if (el) el.addEventListener('click', e => { e.stopPropagation(); handler(); });
    });

    // Set up editable fields for direct clicking
    const editableFields = box.querySelectorAll('.editable-field');
    editableFields.forEach(field => {
      field.addEventListener('click', (e) => {
        e.stopPropagation();
        this.makeFieldEditableForRestoredBox(field, box, itemKey);
      });
    });

    const dragHandle = box.querySelector('.popup-drag-handle');
    if (dragHandle) dragHandle.addEventListener('mousedown', e => this.startDragForBox(e, box, itemKey));
  }

  // Closes a restored infobox and cleans up its resources
  closeRestoredBox(box, itemKey) {
    if (box._resizeObserver) {
      box._resizeObserver.disconnect();
      box._resizeObserver = null;
    }
    box.remove();
    if (window.PopupPinning) {
      const pinningInstance = window.PopupPinning.getInstance();
      pinningInstance.pinnedPopups.delete(`info-box-${itemKey}`);
      document.dispatchEvent(new CustomEvent('popup-unpinned', {
        detail: { popupData: { markerId: `info-box-${itemKey}` } }
      }));
    }
  }

  // Saves the current size of a restored infobox
  saveRestoredBoxSize(box, itemKey) {
    if (!box || !itemKey) return;
    const { offsetWidth: width, offsetHeight: height } = box;
    if (width > 100 && height > 100 && (width !== 550 || height !== 320) && this.isReady()) {
      this.updateItemSize(itemKey, width, height);
    }
  }

  unpinRestoredBox(box, itemKey) { this.closeRestoredBox(box, itemKey); } // Unpins by closing the box

  // Handles dragging functionality for infoboxes
  startDragForBox(e, box, itemKey) {
    e.preventDefault();
    const startX = e.clientX - box.offsetLeft;
    const startY = e.clientY - box.offsetTop;

    const handleMouseMove = e => {
      box.style.left = `${e.clientX - startX}px`;
      box.style.top = `${e.clientY - startY}px`;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (window.PopupPinning && box.classList.contains('pinned')) {
        const rect = box.getBoundingClientRect();
        document.dispatchEvent(new CustomEvent('popup-moved', {
          detail: { popup: box, marker: { id: `info-box-${itemKey}` }, position: { x: rect.left, y: rect.top } }
        }));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // Toggles edit mode for an infobox description field
  toggleEditModeForBox(box) {
    const descField = box.querySelector('[data-field="description"]');
    if (descField && !descField.querySelector('textarea')) this.makeFieldEditableForBox(descField, box);
  }

  // Makes a text field editable by replacing it with a textarea
  makeFieldEditableForBox(field, box) {
    const currentValue = field.textContent;
    const textarea = document.createElement('textarea');
    Object.assign(textarea, { value: currentValue });
    Object.assign(textarea.style, {
      width: '100%', minHeight: '60px', background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid #444', color: '#fff', borderRadius: '4px', padding: '8px'
    });

    textarea.addEventListener('blur', () => {
      field.textContent = textarea.value;
      const itemKey = box.dataset.itemKey;
      if (itemKey) this.saveFieldValueForBox(itemKey, 'description', textarea.value);
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) textarea.blur();
    });

    field.innerHTML = '';
    field.appendChild(textarea);
    textarea.focus();
  }

  // Enhanced method to make any field type editable for restored boxes
  makeFieldEditableForRestoredBox(field, box, itemKey) {
    if (field.classList.contains('editing')) return;
    
    const currentValue = field.textContent.trim();
    const fieldType = field.dataset.field;
    const placeholder = field.getAttribute('placeholder') || 'Enter text...';
    
    field.classList.add('editing');
    
    if (fieldType === 'description' || fieldType === 'notes') {
      const textarea = document.createElement('textarea');
      textarea.value = currentValue;
      textarea.placeholder = placeholder;
      textarea.className = 'field-editor';
      Object.assign(textarea.style, {
        width: '100%', minHeight: '60px', background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid #444', color: '#fff', borderRadius: '4px', padding: '8px'
      });
      
      textarea.addEventListener('blur', () => {
        this.saveFieldValueForRestoredBox(field, textarea.value, fieldType, itemKey);
      });
      
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          textarea.blur();
        }
        if (e.key === 'Escape') {
          field.textContent = currentValue;
          field.classList.remove('editing');
        }
      });
      
      field.innerHTML = '';
      field.appendChild(textarea);
      textarea.focus();
    } else {
      const input = document.createElement('input');
      input.value = currentValue;
      input.placeholder = placeholder;
      input.className = 'field-editor';
      Object.assign(input.style, {
        width: '100%', background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid #444', color: '#fff', borderRadius: '4px', padding: '8px'
      });
      
      input.addEventListener('blur', () => {
        this.saveFieldValueForRestoredBox(field, input.value, fieldType, itemKey);
      });
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
        if (e.key === 'Escape') {
          field.textContent = currentValue;
          field.classList.remove('editing');
        }
      });
      
      field.innerHTML = '';
      field.appendChild(input);
      input.focus();
    }
  }

  // Saves the edited field value and updates the field display for restored boxes
  saveFieldValueForRestoredBox(field, value, fieldType, itemKey) {
    field.textContent = value;
    field.classList.remove('editing');
    
    if (this.isReady() && itemKey) {
      let itemData = this.getOrCreateItemData(itemKey, '');
      if (!itemData) return;
      
      if (fieldType === 'description') {
        itemData.customDescription = value;
      } else if (fieldType === 'location') {
        itemData.customLocation = value;
      } else if (fieldType === 'notes') {
        itemData.notes = value;
      }
      
      this.markerItemData.set(itemKey, itemData);
      this.saveMarkerItemData();
    }
  }

  // Saves a field value that was edited in the infobox
  saveFieldValueForBox(itemKey, fieldType, value) {
    if (this.isReady()) {
      let customData = this.getOrCreateItemData(itemKey, '') || {};
      customData[fieldType] = value;
      this.markerItemData.set(itemKey, customData);
      this.saveMarkerItemData();
    }
  }

  // Recreates a saved infobox from stored position and data
  async restoreInfoBox(popupData) {
    if (popupData.type !== 'info-box' || !popupData.itemKey) {
      console.warn('Invalid info box data for restoration:', popupData);
      return null;
    }

    const keyParts = popupData.itemKey.split('_');
    const markerId = keyParts[0];
    let itemName = 'Unknown Item';
    let itemData = null;
    let markerMap = null;
    
    if (this.isReady()) {
      itemData = this.getItemData(popupData.itemKey);
      if (itemData?.name) itemName = itemData.name;
    }
    
    if (!itemData) {
      let marker = window.markers?.find(m => m.id == markerId);
      
      if (!marker) {
        try {
          const response = await fetch('/api/markers');
          if (response.ok) {
            const allMarkers = await response.json();
            marker = allMarkers.find(m => m.id == markerId);
          }
        } catch (error) {
          console.warn('Error searching all maps for marker in infobox restoration:', error);
        }
      }
      
      if (marker) {
        markerMap = marker.map;
        if (marker.entries) {
          for (const categoryGroup of marker.entries) {
            if (categoryGroup.items) {
              for (const item of categoryGroup.items) {
                const testKey = window.InfoBoxData?.createItemKey(markerId, item.itemname) || 
                               `${markerId}_${item.itemname.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
                if (testKey === popupData.itemKey) {
                  itemName = item.itemname;
                  break;
                }
              }
            }
          }
        }
      }
      
      if (itemName === 'Unknown Item') {
        itemName = keyParts.slice(1).join('_').replace(/_/g, ' ') || popupData.markerName || 'Unknown Item';
      }
    }
    
    console.log('Restoring info box for:', itemName, 'from key:', popupData.itemKey, 'map:', markerMap);
    
    let restoreData = null;
    if (markerMap && markerMap !== window.currentMap && this.temporarySwitchToMap) {
      console.log(`Temporarily switching to map data for infobox: ${markerMap}`);
      restoreData = await this.temporarySwitchToMap(markerMap);
    }
    
    try {
      if (this.isReady()) {
        itemData = this.getItemData(popupData.itemKey);
        if (!itemData) {
          console.log('No existing data found, creating new item data for:', itemName);
          itemData = this.getOrCreateItemData(popupData.itemKey, itemName);
        } else {
          console.log('Found existing data for restored infobox:', itemData);
        }
      } else {
        itemData = { name: itemName };
      }
    } finally {
      if (restoreData) restoreData();
    }
    
    const restoredBox = document.createElement('div');
    restoredBox.id = `item-information-box-${popupData.itemKey}`;
    restoredBox.className = 'item-info-box pinned visible';
    restoredBox.dataset.itemKey = popupData.itemKey;
    
    let template;
    try {
      template = await fetch('/static/templates/item-information-template.html').then(response => response.text());
    } catch (error) {
      console.warn('Template not loaded for restoration');
      return null;
    }
    
    const templateData = window.InfoBoxData?.isReady() 
      ? window.InfoBoxData.prepareTemplateData(itemData, popupData.itemKey)
      : {
          name: itemData.name || 'Unknown Item',
          category: itemData.category || 'Unknown',
          description: itemData.customDescription || itemData.description || 'No description available.',
          location: itemData.customLocation || itemData.location || 'Unknown',
          primaryImage: itemData.image || '/data/assets/Unknown.png',
          itemKey: popupData.itemKey
        };
    
    restoredBox.innerHTML = window.TemplateUtils.fillTemplate(template, templateData);
    
    Object.assign(restoredBox.style, {
      left: `${popupData.position.x}px`,
      top: `${popupData.position.y}px`,
      position: 'fixed',
      zIndex: '500'
    });

    if (itemData.infoboxWidth && itemData.infoboxHeight) {
      restoredBox.style.width = `${itemData.infoboxWidth}px`;
      restoredBox.style.height = `${itemData.infoboxHeight}px`;
    }
    
    document.body.appendChild(restoredBox);
    this.setupRestoredBoxEventHandlers(restoredBox, popupData.itemKey);
    
    const tempInstance = new InfoboxUI();
    tempInstance.box = restoredBox;
    restoredBox._infoboxInstance = tempInstance;
    
    if (window.InfoboxImages) window.InfoboxImages.refreshAdditionalImages(tempInstance);
    
    return restoredBox;
  }

  // Closes all infoboxes and cleans up their resources
  clearAllBoxes() {
    document.querySelectorAll('.item-info-box').forEach(box => {
      if (box._resizeObserver) {
        box._resizeObserver.disconnect();
        box._resizeObserver = null;
      }
      box.remove();
    });
  }

  // Closes only unpinned infoboxes, leaving pinned ones open
  closeAllNonPinned() {
    document.querySelectorAll('.item-info-box:not(.pinned)').forEach(box => {
      if (box._resizeObserver) {
        box._resizeObserver.disconnect();
        box._resizeObserver = null;
      }
      box.remove();
    });
  }

  getBoxCount() { return document.querySelectorAll('.item-info-box').length; } // Returns total number of open infoboxes
  getPinnedBoxCount() { return document.querySelectorAll('.item-info-box.pinned').length; } // Returns number of pinned infoboxes

  // Gets or creates an InfoboxUI instance for a box element
  getInstanceForBox(box) {
    if (box?._infoboxInstance) return box._infoboxInstance;
    const tempInstance = new InfoboxUI();
    tempInstance.box = box;
    box._infoboxInstance = tempInstance;
    return tempInstance;
  }
}

window.InfoBoxSaveLoad = new InfoBoxSaveLoad();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfoBoxSaveLoad;
}
