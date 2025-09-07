class InfoboxUI {
  // Sets up a new infobox with empty values
  constructor() {
    this.box = null;
    this.isVisible = false;
    this.isPinned = false;
    this.currentItemKey = null;
    this.hoverTimeout = null;
    this.hideTimeout = null;
    this.template = null;
    this._manager = null;
    this.resizeObserver = null;
  }

  // Creates the main infobox div and adds it to the page
  createBox() {
    this.box = document.createElement('div');
    const uniqueId = `item-information-box-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.box.id = uniqueId;
    this.box.className = 'item-info-box hidden';
    this.box.style.position = 'fixed';
    document.body.appendChild(this.box);
  }

  // Fills the infobox with item data using the HTML template
  async render(itemData, itemKey) {
    if (!this.template) return;
    
    let templateData;
    if (window.InfoBoxData && window.InfoBoxData.isReady()) {
      templateData = window.InfoBoxData.prepareTemplateData(itemData, itemKey);
    } else {
      templateData = {
        name: itemData.name || 'Unknown Item',
        category: itemData.category || 'Unknown',
        description: itemData.customDescription || itemData.description || 'No description available.',
        location: itemData.customLocation || itemData.location || 'Unknown',
        primaryImage: itemData.image || '/data/assets/Unknown.png',
        itemKey: itemKey
      };
    }
    
    this.box.innerHTML = window.TemplateUtils.fillTemplate(this.template, templateData);
    this.box.dataset.itemKey = itemKey;
    this.box._infoboxInstance = this;
    
    this.applySavedSize(itemData);
    this.setupBoxEventHandlers();
    this.refreshAdditionalImages();
  }

  // Gets the item name from either saved data or the title element
  getItemNameFromBox() {
    const itemKey = this.box.dataset.itemKey;
    if (itemKey && window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.hasItemData(itemKey)) {
      const existingData = window.InfoBoxSaveLoad.getItemData(itemKey);
      if (existingData && existingData.name) {
        return existingData.name;
      }
    }
    
    const titleElement = this.box.querySelector('.info-title');
    if (titleElement) {
      return titleElement.textContent.replace(/\s*Wiki\s*$/, '').trim();
    }
    
    return 'Unknown Item';
  }

  // Sets up all the event listeners for the infobox
  setupBoxEventHandlers() {
    this.setupDragHandling();
    this.setupPinning();
    this.setupClosing();
    this.setupEditing();
    this.setupImageHandling();
    this.setupHoverBehavior();
    this.setupResizeTracking();
  }

  // Makes the drag handle work so you can move the infobox around
  setupDragHandling() {
    const dragHandle = this.box.querySelector('.popup-drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', (e) => this.startSimpleDrag(e));
    }
  }

  // Sets up the pin button to toggle between pinned and unpinned
  setupPinning() {
    const pinBtn = this.box.querySelector('.info-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isPinned ? this.unpin() : this.pin();
      });
    }
  }

  // Makes the close button work to hide the infobox
  setupClosing() {
    const closeBtn = this.box.querySelector('.popup-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.isPinned) this.unpin();
        this.hide(true);
      });
    }

    this.box.addEventListener('click', (e) => {
      if (e.target.matches('.popup-close') || e.target.closest('.popup-close')) {
        e.preventDefault();
        e.stopPropagation();
        if (this.isPinned) this.unpin();
        this.hide(true);
      }
    });
  }

  // Makes text fields clickable so you can edit them
  setupEditing() {
    const editableFields = this.box.querySelectorAll('.editable-field');
    editableFields.forEach(field => {
      field.addEventListener('click', (e) => {
        e.stopPropagation();
        this.makeFieldEditable(field);
      });
    });
  }

  // Sets up image upload button and wiki link behavior
  setupImageHandling() {
    const addImageBtn = this.box.querySelector('.add-image-btn');
    if (addImageBtn) {
      addImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleAddImage();
      });
    }

    const wikiLink = this.box.querySelector('.wiki-link');
    if (wikiLink && wikiLink.href && wikiLink.href !== window.location.href) {
      wikiLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(wikiLink.href, '_blank');
      });
    }
  }

  // Handles mouse enter and leave events for auto-hiding
  setupHoverBehavior() {
    this.box.addEventListener('click', (e) => e.stopPropagation());

    this.box.addEventListener('mouseenter', (e) => {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
      
      if (window.InfoBoxHoverState && this.currentItemKey) {
        window.InfoBoxHoverState.addHover(this.currentItemKey);
        window.InfoBoxHoverState.clearTimeout(this.currentItemKey);
      }
    });

    this.box.addEventListener('mouseleave', (e) => {
      if (!this.isPinned) {
        const timeoutId = setTimeout(() => {
          if (!this.isPinned) this.hide();
        }, 1000);
        
        this.hideTimeout = timeoutId;
        
        if (window.InfoBoxHoverState && this.currentItemKey) {
          window.InfoBoxHoverState.removeHover(this.currentItemKey);
          window.InfoBoxHoverState.setTimeout(this.currentItemKey, timeoutId);
        }
      }
    });
  }

  // Watches for size changes and saves them automatically
  setupResizeTracking() {
    if (!this.box) return;

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.box) {
            this.saveCurrentSize();
          }
        }
      });
      this.resizeObserver.observe(this.box);
    }

    let lastWidth = this.box.offsetWidth;
    let lastHeight = this.box.offsetHeight;
    
    const checkResize = () => {
      if (this.box && (this.box.offsetWidth !== lastWidth || this.box.offsetHeight !== lastHeight)) {
        lastWidth = this.box.offsetWidth;
        lastHeight = this.box.offsetHeight;
        this.saveCurrentSize();
      }
    };

    window.addEventListener('resize', checkResize);
    this.resizeCheckInterval = setInterval(checkResize, 1000);
  }

  // Saves the current width and height to storage
  saveCurrentSize() {
    if (!this.box || !this.currentItemKey) return;

    const width = this.box.offsetWidth;
    const height = this.box.offsetHeight;

    if (width > 100 && height > 100 && (width !== 550 || height !== 320)) {
      if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
        window.InfoBoxSaveLoad.updateItemSize(this.currentItemKey, width, height);
      }
    }
  }

  // Applies saved size from previous sessions
  applySavedSize(itemData) {
    if (!this.box || !itemData) return;

    if (itemData.infoboxWidth && itemData.infoboxHeight) {
      this.box.style.width = `${itemData.infoboxWidth}px`;
      this.box.style.height = `${itemData.infoboxHeight}px`;
    }
  }

  // Switches between edit and view mode for the infobox
  toggleEditMode() {
    const isEditing = this.box.classList.contains('editing-mode');
    
    if (isEditing) {
      this.saveChanges();
      this.box.classList.remove('editing-mode');
    } else {
      this.box.classList.add('editing-mode');
    }
    
    const editBtn = this.box.querySelector('.info-edit-btn');
    if (editBtn) {
      editBtn.textContent = isEditing ? '✏️' : '💾';
      editBtn.title = isEditing ? 'Edit' : 'Save';
    }
  }

  // Turns a text field into an editable input or textarea
  makeFieldEditable(field) {
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
      
      textarea.addEventListener('blur', () => {
        this.saveFieldValue(field, textarea.value, fieldType);
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
      
      input.addEventListener('blur', () => {
        this.saveFieldValue(field, input.value, fieldType);
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

  // Saves the edited field value and updates storage
  saveFieldValue(field, value, fieldType) {
    const itemKey = this.box.dataset.itemKey;
    if (!itemKey) return;
    
    field.textContent = value || field.getAttribute('placeholder') || 'Click to edit...';
    field.classList.remove('editing');
    
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      let itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, '');
      if (!itemData) return;
      
      if (fieldType === 'description') {
        itemData.customDescription = value;
      } else if (fieldType === 'location') {
        itemData.customLocation = value;
      } else if (fieldType === 'notes') {
        itemData.notes = value;
      }
      
      window.InfoBoxSaveLoad.markerItemData.set(itemKey, itemData);
      window.InfoBoxSaveLoad.saveMarkerItemData();
    }
  }

  // Empty function that was meant to save changes but doesn't do anything
  saveChanges() {
  }

  // Opens a file picker to upload new images
  handleAddImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file && window.InfoboxImages) {
        await window.InfoboxImages.uploadAndAddImage(this, file);
      }
    });
    
    input.click();
  }

  // Reloads the additional images section from storage
  refreshAdditionalImages() {
    if (window.InfoboxImages) {
      window.InfoboxImages.refreshAdditionalImages(this);
    }
  }

  // Positions the infobox near the mouse cursor
  position(event) {
    if (!this.box || !event) return;

    this.box.style.visibility = 'hidden';
    this.box.classList.remove('hidden');
    
    const rect = this.box.getBoundingClientRect();
    const margin = 10;
    
    let left = event.clientX + margin;
    let top = event.clientY - rect.height + 90;
    
    if (left + rect.width > window.innerWidth - margin) {
      left = event.clientX - rect.width - margin;
    }
    
    if (top < margin) {
      top = margin;
    } else if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }
    
    this.box.style.left = `${left}px`;
    this.box.style.top = `${top}px`;
    this.box.style.visibility = 'visible';
  }

  // Makes the infobox visible on screen
  show() {
    if (this.isVisible) return;
    
    this.isVisible = true;
    this.box.classList.remove('hidden');
    this.box.classList.add('visible');
    
    clearTimeout(this.hideTimeout);
    
    this.refreshAdditionalImages();
  }

  // Hides the infobox unless it's pinned and force isn't true
  hide(force = false) {
    if (!this.isVisible || (this.isPinned && !force)) return;
    
    this.isVisible = false;
    this.box.classList.remove('visible');
    this.box.classList.add('hidden');
    this.currentItemKey = null;
  }

  // Pins the infobox so it stays open and saves its position
  pin() {
    if (this.isPinned) {
      return;
    }

    this.isPinned = true;
    this.box.classList.add('pinned');
    
    const pinBtn = this.box.querySelector('.info-pin-btn');
    if (pinBtn) {
      pinBtn.textContent = '📌';
      pinBtn.title = 'Unpin';
    }
    
    clearTimeout(this.hoverTimeout);
    clearTimeout(this.hideTimeout);

    const itemKey = this.box.dataset.itemKey;
    if (itemKey) {
      const rect = this.box.getBoundingClientRect();
      
      if (window.PopupSaving?.getInstance) {
        const mockMarker = {
          id: `info-box-${itemKey}`,
          name: this.box.querySelector('.info-title')?.textContent || 'Item Information',
          type: 'info-box',
          itemKey: itemKey
        };

        const savingInstance = window.PopupSaving.getInstance();
        savingInstance.queueSave(mockMarker, { x: rect.left, y: rect.top }, true);
      }
    }
  }

  // Unpins the infobox and removes it from saved positions
  unpin() {
    this.isPinned = false;
    this.box.classList.remove('pinned');
    
    const pinBtn = this.box.querySelector('.info-pin-btn');
    if (pinBtn) {
      pinBtn.textContent = '📌';
      pinBtn.title = 'Pin';
    }

    const itemKey = this.box.dataset.itemKey;
    if (itemKey && window.PopupSaving?.getInstance) {
      const mockMarker = {
        id: `info-box-${itemKey}`,
        type: 'info-box',
        itemKey: itemKey
      };

      const savingInstance = window.PopupSaving.getInstance();
      savingInstance.queueRemove(mockMarker);
    }
  }

  // Shows infobox with specific item data and optional positioning
  showForItemData(itemData, position) {
    const tempKey = `temp_${itemData.name}_${Date.now()}`;
    this.currentItemKey = tempKey;
    this.render(itemData, tempKey);
    if (position) {
      this.position(position);
    }
    this.show();
  }

  // Shows infobox for a specific item name with temporary data
  async showForItem(itemName, event) {
    const itemKey = `temp_${itemName}_${Date.now()}`;
    
    if (this.currentItemKey === itemKey) return;

    this.currentItemKey = itemKey;
    
    let itemData;
    if (window.InfoBoxData && window.InfoBoxData.isReady()) {
      itemData = window.InfoBoxData.findPresetData(itemName) || window.InfoBoxData.createBasicItemData(itemName);
    } else {
      itemData = { name: itemName };
    }
    
    await this.render(itemData, itemKey);
    
    this.position(event);
    
    this.show();
  }

  // Shows infobox for a marker item with saved or default data
  async showForMarkerItem(markerInfo, event) {
    let itemKey;
    if (window.InfoBoxData && window.InfoBoxData.isReady()) {
      itemKey = window.InfoBoxData.createItemKey(markerInfo.markerId, markerInfo.itemName);
    } else {
      const sanitizedName = markerInfo.itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      itemKey = `${markerInfo.markerId}_${sanitizedName}`;
    }
    
    if (this.currentItemKey === itemKey) return;

    this.currentItemKey = itemKey;
    
    let itemData;
    if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
      itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, markerInfo.itemName);
    } else {
      itemData = { name: markerInfo.itemName };
    }
    
    await this.render(itemData, itemKey);
    
    this.position(event);
    
    this.show();
  }

  // Cleans up the infobox and removes all listeners
  destroy() {
    if (this.box) {
      this.box.remove();
    }
    clearTimeout(this.hoverTimeout);
    clearTimeout(this.hideTimeout);
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeCheckInterval) {
      clearInterval(this.resizeCheckInterval);
      this.resizeCheckInterval = null;
    }
  }

  // Handles dragging the infobox around the screen
  startSimpleDrag(e) {
    e.preventDefault();
    const startX = e.clientX - this.box.offsetLeft;
    const startY = e.clientY - this.box.offsetTop;

    const handleMouseMove = (e) => {
      this.box.style.left = `${e.clientX - startX}px`;
      this.box.style.top = `${e.clientY - startY}px`;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (this.isPinned && window.PopupSaving) {
        const rect = this.box.getBoundingClientRect();
        const itemKey = this.box.dataset.itemKey;
        const mockMarker = {
          id: `info-box-${itemKey}`,
          type: 'info-box',
          itemKey: itemKey
        };
        
        const savingInstance = window.PopupSaving.getInstance();
        savingInstance.queueSave(mockMarker, { x: rect.left, y: rect.top }, true);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // Delegate static methods to appropriate modules
  // Closes all infoboxes on the screen
  static clearAllBoxes() {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.clearAllBoxes();
    }
  }

  // Closes only unpinned infoboxes, leaves pinned ones open
  static closeAllNonPinned() {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.closeAllNonPinned();
    }
  }

  // Returns how many infoboxes are currently open
  static getBoxCount() {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.getBoxCount();
    }
    return 0;
  }

  // Returns how many infoboxes are currently pinned
  static getPinnedBoxCount() {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.getPinnedBoxCount();
    }
    return 0;
  }

  // Sets up event handlers for restored infoboxes from saved data
  static setupRestoredBoxEventHandlers(box, itemKey) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.setupRestoredBoxEventHandlers(box, itemKey);
    }
  }

  static closeRestoredBox(box, itemKey) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.closeRestoredBox(box, itemKey);
    }
  }

  static saveRestoredBoxSize(box, itemKey) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.saveRestoredBoxSize(box, itemKey);
    }
  }

  static unpinRestoredBox(box, itemKey) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.unpinRestoredBox(box, itemKey);
    }
  }

  static startDragForBox(e, box, itemKey) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.startDragForBox(e, box, itemKey);
    }
  }

  static toggleEditModeForBox(box) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.toggleEditModeForBox(box);
    }
  }

  static makeFieldEditableForBox(field, box) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.makeFieldEditableForBox(field, box);
    }
  }

  static saveFieldValueForBox(itemKey, fieldType, value) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.saveFieldValueForBox(itemKey, fieldType, value);
    }
  }

  // Recreates a saved infobox from stored data
  static async restoreInfoBox(popupData) {
    if (window.InfoBoxSaveLoad) {
      return await window.InfoBoxSaveLoad.restoreInfoBox(popupData);
    }
    return null;
  }

  static handleImageLoadError(imgElement) {
    if (window.InfoboxImages) {
      return window.InfoboxImages.handleImageLoadError(imgElement);
    }
  }

  static showImageZoom(imgElement) {
    if (window.InfoboxImages) {
      return window.InfoboxImages.showImageZoom(imgElement);
    }
  }

  static hideImageZoom() {
    if (window.InfoboxImages) {
      return window.InfoboxImages.hideImageZoom();
    }
  }

  static async removeImage(index, itemKey) {
    if (window.InfoboxImages) {
      return await window.InfoboxImages.removeImage(index, itemKey);
    }
  }

  static replaceImage(index, itemKey) {
    if (window.InfoboxImages) {
      return window.InfoboxImages.replaceImage(index, itemKey);
    }
  }

  // Gets the InfoboxUI instance connected to a specific box element
  static getInstanceForBox(box) {
    if (window.InfoBoxSaveLoad) {
      return window.InfoBoxSaveLoad.getInstanceForBox(box);
    }
    
    // Fallback if InfoBoxSaveLoad is not available
    if (box && box._infoboxInstance) {
      return box._infoboxInstance;
    }
    
    const tempInstance = new InfoboxUI();
    tempInstance.box = box;
    box._infoboxInstance = tempInstance;
    return tempInstance;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfoboxUI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfoboxUI;
}
