class ItemInformationBox extends InfoboxUI {
  // Sets up the main infobox controller and gets everything ready
  constructor() {
    super();
    this.initialized = false;
    this.tempBoxes = new Map();
    this.init();
  }

  // Loads the template and waits for all the data modules to be ready
  async init() {
    if (this.initialized) return;
    
    try {
      this.template = await fetch('/static/templates/item-information-template.html')
        .then(response => response.text());
      
      await this.waitForDataModules();
      
      this.createBox();
      this.setupGlobalListeners();
      this.setupEventDelegation();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ItemInformationBox:', error);
    }
  }

  // Creates the main infobox element and adds it to the page
  createBox() {
    this.box = document.createElement('div');
    this.box.id = 'item-information-box';
    this.box.className = 'item-info-box hidden';
    
    this.box.style.position = 'fixed';
    
    document.body.appendChild(this.box);
  }

  // Waits for all the data modules to load before continuing
  async waitForDataModules() {
    if (!window.InfoBoxData) {
      console.warn('InfoBoxData not available');
      return;
    }
    await window.InfoBoxData.init();

    if (!window.InfoBoxSaveLoad) {
      console.warn('InfoBoxSaveLoad not available');
      return;
    }
    await window.InfoBoxSaveLoad.init();

    if (!window.InfoBoxDataViewManager) {
      console.warn('InfoBoxDataViewManager not available');
      return;
    }
    await window.InfoBoxDataViewManager.init();
  }

  // Sets up click and escape key listeners for hiding the infobox
  setupGlobalListeners() {
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.isPinned && this.box && !this.box.contains(e.target)) {
        const itemElement = this.findItemElement(e.target);
        if (!itemElement) {
          this.hide();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible && !this.isPinned) {
        this.hide();
      }
    });
  }

  // Listens for mouse events on items anywhere on the page
  setupEventDelegation() {
    document.addEventListener('mouseover', (e) => {
      const itemElement = this.findItemElement(e.target);
      if (itemElement) {
        this.handleItemHover(itemElement, e);
      }
    });

    document.addEventListener('mouseout', (e) => {
      const itemElement = this.findItemElement(e.target);
      if (itemElement && !this.isPinned) {
        this.handleItemLeave();
      }
    });

    document.addEventListener('click', async (e) => {
      const itemElement = this.findItemElement(e.target);
      if (itemElement) {
        await this.handleItemClick(itemElement, e);
      }
    });
  }

  // Finds the closest item element from whatever was clicked, ignoring checkboxes
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

  // Starts a timer to show the infobox after hovering for a bit
  handleItemHover(itemElement, event) {
    clearTimeout(this.hoverTimeout);
    clearTimeout(this.hideTimeout);

    this.hoverTimeout = setTimeout(async () => {
      await this.showForItemElement(itemElement, event);
    }, 1000);
  }

  // Cancels hover timer and starts hide timer when mouse leaves
  handleItemLeave() {
    clearTimeout(this.hoverTimeout);
    
    if (this.isVisible && !this.isPinned) {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      
      this.hideTimeout = setTimeout(() => {
        if (!this.isPinned) {
          this.hide();
        }
      }, 1500);
    }
  }

  // Shows the infobox when an item is clicked
  async handleItemClick(itemElement, event) {
    event.stopPropagation();
    
    const markerInfo = this.extractMarkerInfo(itemElement);
    if (markerInfo) {
      const newItemKey = window.InfoBoxData?.createItemKey(markerInfo.markerId, markerInfo.itemName);
      
      if (this.tempBoxes.has(newItemKey)) {
        console.log('Temp box already exists for', newItemKey, 'pinning it');
        const existingBox = this.tempBoxes.get(newItemKey);
        if (!existingBox.isPinned) {
          existingBox.pin();
        }
        return;
      }
      
      if (this.currentItemKey === newItemKey && this.isVisible) {
        console.log('Main box already showing', newItemKey);
        if (!this.isPinned) {
          this.pin();
        }
        return;
      }
      
      if (this.isPinned && this.currentItemKey && this.currentItemKey !== newItemKey) {
        
        console.log('Creating independent box for click on', newItemKey, 'while main shows', this.currentItemKey);
        
        if (!this.template) {
          console.error('Template not loaded, cannot create independent box');
          return;
        }
        
        const newBox = new InfoboxUI();
        newBox.template = this.template;
        newBox.createBox();
        
        console.log('Created independent box with ID:', newBox.box.id);
        
        this.tempBoxes.set(newItemKey, newBox);
        
        const originalUnpin = newBox.unpin.bind(newBox);
        newBox.unpin = () => {
          console.log('Unpinning independent box for', newItemKey);
          originalUnpin();
          this.tempBoxes.delete(newItemKey);
        };
        
        const originalHide = newBox.hide.bind(newBox);
        newBox.hide = (force = false) => {
          console.log('Hiding independent box for', newItemKey, 'force:', force);
          originalHide(force);
          if (!newBox.isPinned || force) {
            this.tempBoxes.delete(newItemKey);
          }
        };
        
        await newBox.showForMarkerItem(markerInfo, event);
        newBox.pin();
        
        clearTimeout(this.hoverTimeout);
        clearTimeout(this.hideTimeout);
        
        return;
      }
      
      console.log('Showing in main box:', newItemKey);
      await this.showForMarkerItem(markerInfo, event);
      this.pin();
    }
  }

  async showForItemElement(itemElement, event) {
    const markerInfo = this.extractMarkerInfo(itemElement);
    if (markerInfo) {
      const newItemKey = window.InfoBoxData?.createItemKey(markerInfo.markerId, markerInfo.itemName);
      
      if (this.tempBoxes.has(newItemKey)) {
        console.log('Temp box already exists for', newItemKey, 'reusing it');
        return;
      }
      
      if (this.isPinned && this.currentItemKey && this.currentItemKey !== newItemKey) {
        console.log('Creating independent box for hover on', newItemKey, 'while main shows', this.currentItemKey);
        
        if (!this.template) {
          console.error('Template not loaded, cannot create independent box');
          return;
        }
        
        const newBox = new InfoboxUI();
        newBox.template = this.template;
        newBox.createBox();
        
        console.log('Created independent box with ID:', newBox.box.id);
        
        this.tempBoxes.set(newItemKey, newBox);
        
        const originalUnpin = newBox.unpin.bind(newBox);
        newBox.unpin = () => {
          console.log('Unpinning independent box for', newItemKey);
          originalUnpin();
          this.tempBoxes.delete(newItemKey);
        };
        
        const originalHide = newBox.hide.bind(newBox);
        newBox.hide = (force = false) => {
          console.log('Hiding independent box for', newItemKey, 'force:', force);
          originalHide(force);
          if (!newBox.isPinned || force) {
            this.tempBoxes.delete(newItemKey);
          }
        };
        
        await newBox.showForMarkerItem(markerInfo, event);
        
        return;
      }
      
      await this.showForMarkerItem(markerInfo, event);
    }
  }

  // Gets the marker ID and item info from a clicked element
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

  // Saves a field value and updates the storage
  saveFieldValue(field, value, fieldType) {
    const itemKey = this.box.dataset.itemKey;
    if (!itemKey) return;
    
    field.textContent = value || field.getAttribute('placeholder') || 'Click to edit...';
    field.classList.remove('editing');
    
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.updateItemField(itemKey, fieldType, value);
    }
  }

  // Shows the infobox for a specific marker item
  async showForMarkerItem(markerInfo, event) {
    const itemKey = window.InfoBoxData ? 
      window.InfoBoxData.createItemKey(markerInfo.markerId, markerInfo.itemName) : 
      `${markerInfo.markerId}_${markerInfo.itemName}`;
    
    if (this.isPinned) {
      console.log('Main box is pinned, creating new independent infobox for:', itemKey);
      
      if (this.tempBoxes.has(itemKey)) {
        const existingBox = this.tempBoxes.get(itemKey);
        if (existingBox.isVisible) {
          console.log('Independent infobox already exists and visible for', itemKey);
          return;
        }
      }
      
      const newInfoBox = new ItemInformationBox();
      await newInfoBox.init();
      
      this.tempBoxes.set(itemKey, newInfoBox);
      
      const originalDestroy = newInfoBox.destroy.bind(newInfoBox);
      newInfoBox.destroy = (force = false) => {
        originalDestroy();
        this.tempBoxes.delete(itemKey);
      };
      
      await newInfoBox.showForMarkerItem(markerInfo, event);
      
      return;
    }
    
    if (this.currentItemKey === itemKey) return;

    this.currentItemKey = itemKey;
    
    let itemData = window.InfoBoxSaveLoad ? 
      window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, markerInfo.itemName) : 
      { name: markerInfo.itemName };
    
    await this.render(itemData, itemKey);
    
    this.position(event);
    
    this.show();
  }

  // Shows the infobox for a single item without marker context
  async showForItem(itemName, event) {
    const itemKey = `temp_${itemName}_${Date.now()}`;
    
    if (this.currentItemKey === itemKey) return;

    this.currentItemKey = itemKey;
    
    const itemData = window.InfoBoxData ? 
      (window.InfoBoxData.findPresetData(itemName) || window.InfoBoxData.createBasicItemData(itemName)) :
      { name: itemName };
    
    await this.render(itemData, itemKey);
    
    this.position(event);
    
    this.show();
  }

  // Gets data for a marker item from storage or creates default data
  getMarkerItemData(itemKey, itemName) {
    return window.InfoBoxSaveLoad ? 
      window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, itemName) : 
      { name: itemName };
  }

  // Gets item data from presets or creates basic data
  getItemData(itemName) {
    return window.InfoBoxData ? 
      (window.InfoBoxData.findPresetData(itemName) || window.InfoBoxData.createBasicItemData(itemName)) :
      { name: itemName };
  }

  // Gets all saved marker data from storage
  getAllMarkerData() {
    return window.InfoBoxSaveLoad ? window.InfoBoxSaveLoad.getAllMarkerData() : {};
  }

  clearAllMarkerData() {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.clearAllMarkerData();
    }
  }

  // Clears saved data for a specific marker
  cleanupMarkerData(markerId) {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.cleanupMarkerData(markerId);
    }
  }

  // Makes sure item data exists for a marker
  ensureItemDataExists(marker) {
    this.synchronizeMarkerData(marker);
  }

  // Syncs marker data with the storage system
  synchronizeMarkerData(marker) {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      window.InfoBoxSaveLoad.synchronizeMarkerData(marker);
    }
  }

  // Imports marker data from external source
  importMarkerData(data) {
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      return window.InfoBoxSaveLoad.importMarkerData(data);
    }
    return false;
  }

  destroy() {
    if (this.box) {
      this.box.remove();
    }
    this.tempBoxes.forEach((tempBox, key) => {
      if (tempBox.box) {
        tempBox.box.remove();
      }
    });
    this.tempBoxes.clear();
    
    clearTimeout(this.hoverTimeout);
    clearTimeout(this.hideTimeout);
  }

  // Removes all temporary infoboxes from the screen
  clearAllTempBoxes() {
    this.tempBoxes.forEach((infoBox, key) => {
      if (infoBox.destroy) {
        infoBox.destroy(true);
      } else if (infoBox.box) {
        infoBox.box.remove();
      }
    });
    this.tempBoxes.clear();
  }

  // Counts how many infoboxes are currently visible
  getAllBoxCount() {
    let count = this.isVisible ? 1 : 0;
    count += this.tempBoxes.size;
    return count;
  }

  // Restores a saved infobox from data
  static async restoreInfoBox(popupData) {
    return await InfoboxUI.restoreInfoBox(popupData);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing ItemInformationBox with singleton approach');
  
  const instance = new ItemInformationBox();
  await instance.init();

  window.ItemInformationBox = {
    restoreInfoBox: InfoboxUI.restoreInfoBox.bind(InfoboxUI),
    clearAllBoxes: () => {
      InfoboxUI.clearAllBoxes();
      instance.clearAllTempBoxes();
    },
    closeAllNonPinned: InfoboxUI.closeAllNonPinned.bind(InfoboxUI),
    getBoxCount: instance.getAllBoxCount.bind(instance),
    getPinnedBoxCount: InfoboxUI.getPinnedBoxCount.bind(InfoboxUI),
    
    cleanupMarkerData: instance.cleanupMarkerData.bind(instance),
    ensureItemDataExists: instance.ensureItemDataExists.bind(instance),
    synchronizeMarkerData: instance.synchronizeMarkerData.bind(instance),
    cleanupOrphanedData: async () => {
      if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
        return await window.InfoBoxSaveLoad.cleanupOrphanedData();
      }
      return 0;
    },
    
    clearAllTempBoxes: instance.clearAllTempBoxes.bind(instance),
    
    _instance: instance
  };

  window.itemInformationBox = {
    cleanupMarkerData: instance.cleanupMarkerData.bind(instance),
    ensureItemDataExists: instance.ensureItemDataExists.bind(instance),
    synchronizeMarkerData: instance.synchronizeMarkerData.bind(instance),
    cleanupOrphanedData: async () => {
      if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
        return await window.InfoBoxSaveLoad.cleanupOrphanedData();
      }
      return 0;
    }
  };
  
  console.log('ItemInformationBox initialized successfully');
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ItemInformationBox;
}
