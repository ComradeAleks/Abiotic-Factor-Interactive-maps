window.InfoBoxHoverState = window.InfoBoxHoverState || {
  activeHovers: new Set(),
  activeTimeouts: new Map(),
  
  // Adds an item to the active hover list
  addHover(key) {
    this.activeHovers.add(key);
  },
  
  // Removes an item from the active hover list
  removeHover(key) {
    this.activeHovers.delete(key);
  },
  
  // Checks if an item is currently being hovered
  hasActiveHover(key) {
    return this.activeHovers.has(key);
  },
  
  // Stores a timeout ID for later cleanup
  setTimeout(key, timeoutId) {
    if (this.activeTimeouts.has(key)) {
      clearTimeout(this.activeTimeouts.get(key));
    }
    this.activeTimeouts.set(key, timeoutId);
  },
  
  // Clears a specific timeout and removes it from storage
  clearTimeout(key) {
    if (this.activeTimeouts.has(key)) {
      clearTimeout(this.activeTimeouts.get(key));
      this.activeTimeouts.delete(key);
    }
  },
  
  // Clears all stored timeouts at once
  clearAllTimeouts() {
    this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.activeTimeouts.clear();
  }
};

class ItemInformationBoxManager {
  // Sets up the manager with empty storage and starts initialization
  constructor() {
    this.instances = new Map();
    this.sharedData = {
      presetData: new Map(),
      markerItemData: new Map(),
      template: null
    };
    this.initialized = false;
    this.hoveredInstance = null;
    this.init();
  }

  // Creates a unique key by combining marker ID and item name
  createItemKey(markerId, itemName) {
    return window.InfoBoxData ? 
      window.InfoBoxData.createItemKey(markerId, itemName) : 
      `${markerId}_${itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
  }

  // Creates detailed item data with category and description info
  createRichItemData(itemName, category) {
    if (window.InfoBoxData && window.InfoBoxData.isReady()) {
      return window.InfoBoxData.getEnhancedItemData(itemName, { category });
    }

    return {
      itemName: itemName,
      category: category || 'Unknown',
      location: 'Unknown',
      description: 'No description available.',
      notes: ''
    };
  }

  // Loads preset data from either InfoBoxData or API fallback
  async loadPresetData() {
    if (window.InfoBoxData) {
      await window.InfoBoxData.init();
      this.sharedData.presetData = window.InfoBoxData.presetData;
      return;
    }

    try {
      const response = await fetch('/api/presets');
      if (!response.ok) {
        console.warn('Could not load presets from API');
        return;
      }
      
      const presetData = await response.json();
      let totalItemsLoaded = 0;
      
      for (const [category, items] of Object.entries(presetData)) {
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.item) {
              const itemName = item.item.toLowerCase().trim();
              this.sharedData.presetData.set(itemName, {
                name: item.item,
                category: category,
                subcategory: item.subcategory || '',
                wiki: item.link || '',
                location: 'Unknown',
                type: item.Type || 'Unknown',
                drops: item.Drops || [],
                harvestableDrops: item['Harvestable Drops'] || [],
                trades: item.Trade || [],
                description: item.description || '',
                image: item.image || '',
                additionalImage: ''
              });
              totalItemsLoaded++;
            }
          });
        }
      }
      
      console.log(`Manager loaded ${totalItemsLoaded} preset items from ${Object.keys(presetData).length} categories`);
    } catch (error) {
      console.error('Failed to load preset data:', error);
    }
  }

  // Initializes the manager by loading template and data
  async init() {
    if (this.initialized) return;
    
    try {
      this.sharedData.template = await fetch('/static/templates/item-information-template.html')
        .then(response => response.text());
      
      await this.loadPresetData();
      
      this.setupEventDelegation();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ItemInformationBoxManager:', error);
    }
  }

  // Sets up global event listeners for hover and click detection
  setupEventDelegation() {
    document.addEventListener('mouseover', (e) => {
      const itemElement = this.findItemElement(e.target);
      if (itemElement) {
        this.addDirectHoverEvents(itemElement);
        
        if (!itemElement.dataset.hoverEventsAdded) {
          this.handleItemHover(itemElement, e);
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const itemElement = this.findItemElement(e.target);
      if (itemElement) {
        if (!itemElement.dataset.hoverEventsAdded) {
          this.handleItemLeave(itemElement, e);
        }
      }
    });

    document.addEventListener('click', (e) => {
      const itemElement = this.findItemElement(e.target);
      if (itemElement) {
        this.handleItemClick(itemElement, e);
      }
    });
  }

  // Adds direct mouse events to individual item elements for better control
  addDirectHoverEvents(itemElement) {
    if (itemElement.dataset.hoverEventsAdded) return;
    itemElement.dataset.hoverEventsAdded = 'true';

    const manager = this;

    itemElement.addEventListener('mouseenter', () => {
      const markerInfo = manager.extractMarkerInfo(itemElement);
      if (markerInfo) {
        const itemKey = manager.createItemKey(markerInfo.markerId, markerInfo.itemName);
        const instance = manager.instances.get(itemKey);
        
        window.InfoBoxHoverState.addHover(itemKey);
        
        if (instance && instance.isVisible) {
          if (instance.hideTimeout) {
            clearTimeout(instance.hideTimeout);
            instance.hideTimeout = null;
          }
          window.InfoBoxHoverState.clearTimeout(itemKey);
          return;
        }
        
        manager.instances.forEach(inst => {
          if (inst.hideTimeout) {
            clearTimeout(inst.hideTimeout);
            inst.hideTimeout = null;
          }
        });
        window.InfoBoxHoverState.clearAllTimeouts();
      }
    });

    itemElement.addEventListener('mouseleave', () => {
      const markerInfo = manager.extractMarkerInfo(itemElement);
      if (markerInfo) {
        const itemKey = manager.createItemKey(markerInfo.markerId, markerInfo.itemName);
        const instance = manager.instances.get(itemKey);
        
        window.InfoBoxHoverState.removeHover(itemKey);
        
        if (instance && !instance.isPinned) {
          if (instance.hoverTimeout) {
            clearTimeout(instance.hoverTimeout);
            instance.hoverTimeout = null;
            window.InfoBoxHoverState.clearTimeout(itemKey);
          }
          
          if (instance.isVisible) {
            const timeoutId = setTimeout(() => {
              if (!instance.isPinned) {
                instance.hide();
                manager.instances.delete(itemKey);
              }
            }, 500);
            
            instance.hideTimeout = timeoutId;
            window.InfoBoxHoverState.setTimeout(itemKey, timeoutId);
          } else {
            manager.instances.delete(itemKey);
          }
        }
      }
    });
  }

  // Finds the clickable item element from any target element
  findItemElement(target) {
    if (target.matches('input[type="checkbox"]') || target.closest('input[type="checkbox"]')) {
      return null;
    }
    
    const itemName = target.closest('.item-name, .cluster-item-name');
    const itemImg = target.closest('.item-img, .cluster-item-img');
    const popupItem = target.closest('.popup-item, .cluster-item');
    
    if (itemName || itemImg) {
      return popupItem || target.closest('.popup-item, .cluster-item');
    }
    
    return null;
  }

  // Gets marker ID and item info from DOM elements
  extractMarkerInfo(itemElement) {
    const popupItem = itemElement.closest('.popup-item, .cluster-item');
    if (!popupItem) return null;

    let markerId, itemIndex, itemName;

    if (popupItem.classList.contains('cluster-item')) {
      markerId = popupItem.dataset.markerId;
      itemIndex = popupItem.dataset.entryIndex;
      const nameElement = popupItem.querySelector('.cluster-item-name');
      itemName = nameElement?.textContent.trim();
    } else {
      const popupInstance = window.getMarkerPopupInstance?.();
      if (popupInstance && popupInstance.currentMarker) {
        markerId = popupInstance.currentMarker.id;
        itemIndex = popupItem.dataset.index;
        const nameElement = popupItem.querySelector('.item-name');
        itemName = nameElement?.textContent.trim();
      } else {
        console.warn('No popup instance or current marker available');
        return null;
      }
    }

    if (!markerId || itemIndex === undefined || !itemName) {
      console.warn('Could not extract marker info:', { markerId, itemIndex, itemName, element: itemElement });
      return null;
    }

    return {
      markerId: markerId,
      itemIndex: parseInt(itemIndex),
      itemName: itemName
    };
  }

  // Handles mouse hover by starting a timer to show infobox
  handleItemHover(itemElement, event) {
    const markerInfo = this.extractMarkerInfo(itemElement);
    if (!markerInfo) return;

    const itemKey = this.createItemKey(markerInfo.markerId, markerInfo.itemName);
    
    if (this.instances.has(itemKey) && this.instances.get(itemKey).isPinned) {
      return;
    }

    if (this.instances.has(itemKey) && this.instances.get(itemKey).isVisible) {
      const existingInstance = this.instances.get(itemKey);
      if (existingInstance.hideTimeout) {
        clearTimeout(existingInstance.hideTimeout);
        existingInstance.hideTimeout = null;
      }
      window.InfoBoxHoverState.addHover(itemKey);
      window.InfoBoxHoverState.clearTimeout(itemKey);
      return;
    }

    this.instances.forEach(instance => {
      if (instance.hoverTimeout) {
        clearTimeout(instance.hoverTimeout);
        instance.hoverTimeout = null;
      }
      if (instance.hideTimeout) {
        clearTimeout(instance.hideTimeout);
        instance.hideTimeout = null;
      }
    });

    window.InfoBoxHoverState.clearAllTimeouts();
    window.InfoBoxHoverState.addHover(itemKey);

    let instance = this.getOrCreateInstance(itemKey);
    this.hoveredInstance = instance;

    if (!instance.isPinned && !instance.isVisible) {
      const timeoutId = setTimeout(() => {
        if (!instance.isPinned && !instance.isVisible && window.InfoBoxHoverState.hasActiveHover(itemKey)) {
          this.showForMarkerItem(markerInfo, event);
        }
      }, 1000);
      
      instance.hoverTimeout = timeoutId;
      window.InfoBoxHoverState.setTimeout(itemKey, timeoutId);
    }
  }

  // Handles mouse leave by starting hide timer for unpinned boxes
  handleItemLeave(itemElement, event) {
    let markerInfo = null;
    let itemKey = null;
    
    if (itemElement) {
      markerInfo = this.extractMarkerInfo(itemElement);
      if (markerInfo) {
        itemKey = this.createItemKey(markerInfo.markerId, markerInfo.itemName);
      }
    }
    
    if (itemKey) {
      const instance = this.instances.get(itemKey);
      
      window.InfoBoxHoverState.removeHover(itemKey);
      
      if (instance && !instance.isPinned) {
        if (instance.hoverTimeout) {
          clearTimeout(instance.hoverTimeout);
          instance.hoverTimeout = null;
          window.InfoBoxHoverState.clearTimeout(itemKey);
        }
        
        if (instance.isVisible) {
          const timeoutId = setTimeout(() => {
            if (!instance.isPinned) {
              instance.hide();
              this.instances.delete(itemKey);
            }
          }, 500);
          
          instance.hideTimeout = timeoutId;
          window.InfoBoxHoverState.setTimeout(itemKey, timeoutId);
        } else {
          this.instances.delete(itemKey);
        }
      }
    } else {
      if (this.hoveredInstance && !this.hoveredInstance.isPinned) {
        if (this.hoveredInstance.hoverTimeout) {
          clearTimeout(this.hoveredInstance.hoverTimeout);
          this.hoveredInstance.hoverTimeout = null;
        }
        
        if (this.hoveredInstance.isVisible) {
          const timeoutId = setTimeout(() => {
            if (!this.hoveredInstance.isPinned) {
              this.hoveredInstance.hide();
              // Find and remove from instances map
              for (const [key, instance] of this.instances) {
                if (instance === this.hoveredInstance) {
                  this.instances.delete(key);
                  break;
                }
              }
              this.hoveredInstance = null;
            }
          }, 500);
          
          this.hoveredInstance.hideTimeout = timeoutId;
        } else {
          this.hoveredInstance = null;
        }
      }
    }
  }

  // Shows and pins an infobox when item is clicked
  handleItemClick(itemElement, event) {
    event.stopPropagation();
    
    const markerInfo = this.extractMarkerInfo(itemElement);
    if (!markerInfo) return;

    const itemKey = this.createItemKey(markerInfo.markerId, markerInfo.itemName);
    
    let instance = this.getOrCreateInstance(itemKey);
    
    this.showForMarkerItem(markerInfo, event);
    instance.pin();
  }

  // Gets existing infobox or creates a new one for the item
  getOrCreateInstance(itemKey) {
    if (this.instances.has(itemKey)) {
      return this.instances.get(itemKey);
    }

    let instance;
    if (typeof InfoboxUI === 'function') {
      instance = new InfoboxUI();
    } else if (window.InfoboxUI && typeof window.InfoboxUI === 'function') {
      instance = new window.InfoboxUI();
    } else {
      console.error('InfoboxUI constructor not available');
      return null;
    }
    
    instance.template = this.sharedData.template;
    instance.initialized = true;
    instance._manager = this;

    instance.createBox();

    this.setupInstanceEventHandlers(instance);

    const originalHide = instance.hide.bind(instance);
    instance.hide = (force = false) => {
      originalHide(force);
      if (!instance.isPinned || force) {
        this.instances.delete(itemKey);
      }
    };

    instance.box.dataset.itemKey = itemKey;
    this.instances.set(itemKey, instance);
    return instance;
  }

  // Adds drag, pin, close and hover events to an infobox
  setupInstanceEventHandlers(instance) {
    if (!instance.box) return;

    const dragHandle = instance.box.querySelector('.popup-drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', (e) => {
        this.startSimpleDrag(e, instance);
      });
    }

    const pinBtn = instance.box.querySelector('.info-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (instance.isPinned) {
          instance.unpin();
        } else {
          instance.pin();
        }
      });
    }

    const closeBtn = instance.box.querySelector('.popup-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (instance.isPinned) {
          instance.unpin();
        }
        instance.hide(true);
      });
    }

    instance.box.addEventListener('click', (e) => e.stopPropagation());

    instance.box.addEventListener('mouseenter', () => {
      this.instances.forEach(inst => {
        if (inst.hideTimeout) {
          clearTimeout(inst.hideTimeout);
          inst.hideTimeout = null;
        }
        if (inst.hoverTimeout) {
          clearTimeout(inst.hoverTimeout);
          inst.hoverTimeout = null;
        }
      });
    });

    instance.box.addEventListener('mouseleave', () => {
      if (!instance.isPinned) {
        instance.hideTimeout = setTimeout(() => {
          if (!instance.isPinned) {
            instance.hide();
            this.instances.delete(instance.box.dataset.itemKey);
          }
        }, 500);
      }
    });
  }

  // Handles dragging an infobox around the screen
  startSimpleDrag(e, instance) {
    e.preventDefault();
    const startX = e.clientX - instance.box.offsetLeft;
    const startY = e.clientY - instance.box.offsetTop;

    const handleMouseMove = (e) => {
      instance.box.style.left = `${e.clientX - startX}px`;
      instance.box.style.top = `${e.clientY - startY}px`;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // Shows infobox for a specific marker item with data loading
  async showForMarkerItem(markerInfo, event) {
    const itemKey = this.createItemKey(markerInfo.markerId, markerInfo.itemName);
    
    this.instances.forEach((instance, key) => {
      if (key !== itemKey && !instance.isPinned && instance.isVisible) {
        instance.hide();
        this.instances.delete(key);
      }
    });
    
    const instance = this.getOrCreateInstance(itemKey);
    
    let itemData;
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, markerInfo.itemName);
    } else {
      itemData = this.createRichItemData(markerInfo.itemName, 'Unknown');
    }

    await instance.render(itemData, itemKey);
    if (event) {
      instance.position(event);
    }
    instance.show();
  }

  // Closes and removes all infoboxes from screen
  clearAllBoxes() {
    this.instances.forEach(instance => {
      instance.hide();
      if (instance.box) {
        instance.box.remove();
      }
    });
    this.instances.clear();
  }

  // Closes only unpinned infoboxes, leaves pinned ones open
  closeAllNonPinned() {
    this.instances.forEach((instance, itemKey) => {
      if (!instance.isPinned) {
        instance.hide();
        this.instances.delete(itemKey);
      }
    });
  }

  // Returns total number of active infoboxes
  getBoxCount() {
    return this.instances.size;
  }

  // Counts how many infoboxes are currently pinned
  getPinnedBoxCount() {
    let count = 0;
    this.instances.forEach(instance => {
      if (instance.isPinned) count++;
    });
    return count;
  }

  // Recreates a saved infobox from stored data
  async restoreInfoBox(popupData) {
    try {
      if (!popupData || !popupData.itemKey) {
        console.warn('Invalid popup data for restoration:', popupData);
        return null;
      }

      let itemName;
      if (popupData.itemKey.startsWith('temp_')) {
        const parts = popupData.itemKey.split('_');
        if (parts.length >= 3) {
          parts.shift();
          parts.pop();
          itemName = parts.join('_');
        } else {
          itemName = popupData.itemKey.replace('temp_', '');
        }
      } else {
        itemName = popupData.itemKey;
      }

      const instance = this.getOrCreateInstance(itemName);
      
      let itemData;
      if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
        itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemName, itemName);
      } else {
        itemData = this.createRichItemData(itemName, 'Unknown');
      }
      
      await instance.render(itemData, itemName);
      
      if (popupData.position) {
        instance.box.style.left = `${popupData.position.x}px`;
        instance.box.style.top = `${popupData.position.y}px`;
      }
      
      instance.show();
      instance.pin();
      
      return instance.box;
      
    } catch (error) {
      console.error('Failed to restore info box:', error);
      return null;
    }
  }

  // Removes saved data for a specific marker
  cleanupMarkerData(markerId) {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.cleanupMarkerData(markerId);
    }
  }

  // Makes sure item data exists for a marker
  ensureItemDataExists(marker) {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.synchronizeMarkerData(marker);
    }
  }

  // Syncs marker data with the save/load system
  synchronizeMarkerData(marker) {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.synchronizeMarkerData(marker);
    }
  }

  // Removes old data that's no longer needed
  async cleanupOrphanedData() {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      return await window.InfoBoxSaveLoad.cleanupOrphanedData();
    }
    return 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ItemInformationBoxManager;
}

window.ItemInformationBoxManager = ItemInformationBoxManager;
