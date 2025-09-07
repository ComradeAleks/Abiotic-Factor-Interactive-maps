class PopupPinning {
  // Sets up the popup pinning system with storage for pinned popups and drag state
  constructor() {
    this.pinnedPopups = new Map();
    this.dragState = { isDragging: false, currentPopup: null, offset: { x: 0, y: 0 } };
    this.setupGlobalListeners();
  }

  // Finds a marker by ID, first checking current markers then fetching all if needed
  async findMarkerById(markerId) {
    const found = window.markers?.find(m => m.id === markerId);
    if (found) return found;
    
    try {
      const response = await fetch('/api/markers');
      return response.ok ? (await response.json()).find(m => m.id === markerId) : null;
    } catch (error) {
      console.warn('Error searching all maps for marker:', error);
      return null;
    }
  }

  // Makes a popup draggable by adding drag controls and disabling default dragging
  makePopupDraggable(popupElement, marker) {
    this.addDragControls(popupElement, marker);
    popupElement.draggable = false;
  }

  // Adds drag handle and pin button to the popup header
  addDragControls(popupElement, marker) {
    const header = popupElement.querySelector('.popup-header');
    if (!header) return;

    const dragHandle = Object.assign(document.createElement('div'), {
      innerHTML: '⋮⋮',
      title: 'Drag to move popup',
      className: 'popup-drag-handle',
      onmousedown: (e) => this.startDrag(e, popupElement, marker)
    });

    const pinButton = Object.assign(document.createElement('button'), {
      innerHTML: '📌',
      title: 'Pin popup',
      className: 'popup-pin-btn',
      onclick: (e) => { e.stopPropagation(); this.togglePinPopup(popupElement, marker, pinButton); }
    });

    this.updatePinButtonState(pinButton, marker);
    header.prepend(pinButton, dragHandle);
  }

  // Sets up global mouse listeners for dragging and prevents context menu on drag handles
  setupGlobalListeners() {
    document.addEventListener('mousemove', (e) => this.handleDrag(e));
    document.addEventListener('mouseup', (e) => this.endDrag(e));
    document.addEventListener('contextmenu', (e) => {
      if (e.target.classList.contains('popup-drag-handle')) e.preventDefault();
    });
  }

  // Starts dragging by recording initial position and setting drag state
  startDrag(e, popupElement, marker) {
    e.preventDefault();
    e.stopPropagation();

    const rect = popupElement.getBoundingClientRect();
    Object.assign(this.dragState, {
      isDragging: true,
      currentPopup: popupElement,
      currentMarker: marker,
      offset: { x: e.clientX - rect.left, y: e.clientY - rect.top }
    });

    popupElement.classList.add('popup-dragging');
    document.body.style.cursor = 'move';
  }

  // Moves popup during drag while keeping it within screen boundaries
  handleDrag(e) {
    if (!this.dragState.isDragging) return;
    e.preventDefault();
    
    const { currentPopup: popup, offset } = this.dragState;
    const rect = popup.getBoundingClientRect();
    const margin = 10, sidebarWidth = 340, topbarHeight = 60;
    
    const newLeft = Math.max(sidebarWidth + margin, Math.min(e.clientX - offset.x, window.innerWidth - rect.width - margin));
    const newTop = Math.max(topbarHeight + margin, Math.min(e.clientY - offset.y, window.innerHeight - rect.height - margin));

    Object.assign(popup.style, { left: `${newLeft}px`, top: `${newTop}px` });
  }

  // Ends dragging and fires a move event for pinned popups
  endDrag(e) {
    if (!this.dragState.isDragging) return;
    const { currentPopup: popup, currentMarker: marker } = this.dragState;
    popup?.classList.remove('popup-dragging');
    document.body.style.cursor = '';
    
    if (popup?.classList.contains('popup-pinned')) {
      const rect = popup.getBoundingClientRect();
      document.dispatchEvent(new CustomEvent('popup-moved', {
        detail: { popup, marker, position: { x: rect.left, y: rect.top } }
      }));
    }
    
    Object.assign(this.dragState, { isDragging: false, currentPopup: null, currentMarker: null, offset: { x: 0, y: 0 } });
  }

  // Updates pin button appearance and tooltip based on pinned state
  updatePinButtonState(pinButton, marker, isPinnedPopup = null) {
    const isPinned = isPinnedPopup ?? (pinButton.closest('.popup-pinned') !== null);
    pinButton.classList.toggle('popup-unpin-btn', isPinned);
    pinButton.title = isPinned ? 'Unpin popup' : 'Pin popup';
  }

  // Switches popup between pinned and unpinned states
  togglePinPopup(popupElement, marker, pinButton) {
    const isPinnedPopup = popupElement.classList.contains('popup-pinned');
    isPinnedPopup ? this.unpinPopup(popupElement, marker) : this.pinPopup(popupElement, marker);
    this.updatePinButtonState(pinButton, marker, !isPinnedPopup);
  }

  // Pins a popup by creating a permanent copy and closing the original
  pinPopup(popupElement, marker) {
    const rect = popupElement.getBoundingClientRect();
    const popupId = `popup-${marker.id || marker.name || 'unknown'}-${Date.now()}`;
    const popupData = {
      markerId: marker.id,
      markerName: marker.name,
      isCluster: marker.isCluster || false,
      position: { x: rect.left, y: rect.top },
      timestamp: Date.now()
    };

    this.pinnedPopups.set(popupId, popupData);
    this.createPinnedPopupFromOriginal(popupElement, marker, popupData, popupId);
    this.closeOriginalPopup(popupElement);
    this.showPinFeedback();
    
    document.dispatchEvent(new CustomEvent('popup-pinned', {
      detail: { popup: popupElement, marker, position: { x: rect.left, y: rect.top } }
    }));
  }

  // Tries different methods to close the original popup after pinning
  closeOriginalPopup(popupElement) {
    [
      () => typeof hideMarkerPopup === 'function' && hideMarkerPopup(),
      () => window.markerPopupInstance?.hide?.(),
      () => window.markerPopup?.hide?.(),
      () => popupElement.querySelector('.popup-close')?.click(),
      () => Object.assign(popupElement.style, { display: 'none', visibility: 'hidden' })
    ].some(method => { try { method(); return true; } catch { return false; } });
  }

  // Creates a pinned popup by cloning the original and setting up all the event handlers
  createPinnedPopupFromOriginal(originalPopup, marker, popupData, popupId = null) {
    const pinnedPopup = originalPopup.cloneNode(true);
    
    Object.assign(pinnedPopup, { 
      id: popupId || `pinned-popup-${marker.id}-${Date.now()}`,
      className: 'marker-popup popup-pinned visible'
    });
    
    Object.assign(pinnedPopup.style, {
      left: `${popupData.position.x}px`, 
      top: `${popupData.position.y}px`,
      position: 'fixed', 
      visibility: 'visible'
    });

    this.clearClonedEventHandlers(pinnedPopup);

    const pinButton = pinnedPopup.querySelector('.popup-pin-btn');
    const dragHandle = pinnedPopup.querySelector('.popup-drag-handle');
    const closeBtn = pinnedPopup.querySelector('.popup-close');

    if (pinButton) {
      this.updatePinButtonState(pinButton, marker, true);
      pinButton.onclick = (e) => { e.stopPropagation(); this.togglePinPopup(pinnedPopup, marker, pinButton); };
    }
    if (dragHandle) dragHandle.onmousedown = (e) => this.startDrag(e, pinnedPopup, marker);
    if (closeBtn) closeBtn.onclick = () => this.unpinPopupByElement(pinnedPopup);

    this.setupPinnedPopupEventHandlers(pinnedPopup, marker);
    document.body.appendChild(pinnedPopup);
    
    if (popupId && !this.pinnedPopups.has(popupId)) {
      this.pinnedPopups.set(popupId, { ...popupData, markerId: marker.id });
    }
    
    pinnedPopup.classList.add('popup-pin-animation');
    setTimeout(() => pinnedPopup.classList.remove('popup-pin-animation'), 100);
    return pinnedPopup;
  }

  // Recreates a popup from saved data by trying to get fresh content or using fallbacks
  async createRestoredPopup(marker, popupData) {
    const tempPopup = Object.assign(document.createElement('div'), { 
      className: 'marker-popup',
      style: 'position: absolute; left: -9999px; visibility: hidden;'
    });
    
    let content = null;

    // Try to get content from openUniversalPopup
    if (!content && typeof openUniversalPopup === 'function') {
      try {
        const restoreData = marker.map && window.InfoBoxSaveLoad?.temporarySwitchToMap ? 
          await window.InfoBoxSaveLoad.temporarySwitchToMap(marker.map) : null;

        try {
          await openUniversalPopup(marker);
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const activePopup = document.querySelector('.marker-popup:not(.popup-pinned)');
          const isGoodContent = activePopup?.innerHTML.length > 500 && 
            !activePopup.classList.contains('hidden') && 
            !activePopup.classList.contains('animating-out');
          
          if (isGoodContent) {
            content = activePopup.innerHTML;
          } else {
            // Retry once
            await new Promise(resolve => setTimeout(resolve, 100));
            const retryPopup = document.querySelector('.marker-popup:not(.popup-pinned)');
            if (retryPopup?.innerHTML.length > 500 && 
                !retryPopup.classList.contains('hidden') && 
                !retryPopup.classList.contains('animating-out')) {
              content = retryPopup.innerHTML;
            }
          }

          // Hide the popup
          if (activePopup) {
            Object.assign(activePopup.style, { position: 'absolute', left: '-9999px', top: '-9999px' });
            try {
              typeof hideMarkerPopup === 'function' ? hideMarkerPopup() : 
              window.MarkerPopup?.hidePopup?.() || activePopup.remove();
            } catch { activePopup.remove(); }
          }
        } finally {
          restoreData?.();
        }
      } catch (error) {
        console.warn('openUniversalPopup failed:', error);
      }
    }
    
    // Use fallback content if popup loading failed
    if (!content) {
      try {
        content = this.createFallbackContent(marker);
      } catch (error) {
        console.warn('createFallbackContent failed:', error);
        const errorTemplate = window.TemplateUtils?.getTemplate('popup-error-template');
        content = errorTemplate || '<div class="popup-header"><h3>Error loading content</h3></div>';
      }
    }
    
    tempPopup.innerHTML = content;
    document.body.appendChild(tempPopup);
    
    const popupId = `pinned-popup-${marker.id}-${Date.now()}`;
    const pinnedPopup = this.createPinnedPopupFromOriginal(tempPopup, marker, popupData, popupId);
    tempPopup.remove();
    return pinnedPopup;
  }

  // Removes old onclick/onchange attributes from cloned popup elements
  clearClonedEventHandlers(popup) {
    popup.querySelectorAll('[onclick], [onchange]').forEach(el => {
      el.removeAttribute('onclick');
      el.removeAttribute('onchange');
    });
  }

  // Sets up click handlers for edit buttons and checkboxes in pinned popups
  setupPinnedPopupEventHandlers(popup, marker) {
    window.ItemMarking?.attachCheckboxHandlers(popup, marker);

    popup.querySelectorAll('.popup-button.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.universalEdit?.(marker, popup);
      });
    });

    popup.querySelectorAll('.cluster-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const markerIndex = parseInt(e.target.dataset.markerIndex);
        const clusterMarker = marker.clusterMarkers?.[markerIndex];
        if (clusterMarker) window.universalEdit?.(clusterMarker, popup, marker, markerIndex);
      });
    });

    popup.addEventListener('click', (e) => {
      if (!e.target.matches('input[type="checkbox"]') && 
          !e.target.closest('.popup-item, .cluster-item, .item-name, .cluster-item-name, .item-img, .cluster-item-img')) {
        e.stopPropagation();
      }
    });
  }

  // Generates fallback HTML content using templates when popup loading fails
  createFallbackContent(marker) {
    const title = marker.name || (marker.isCluster ? 'Cluster Marker' : 'Marker');
    const itemCount = marker.isCluster ? marker.clusterMarkers?.length || 0 : marker.entries?.length || 0;
    
    if (marker.isCluster && marker.clusterMarkers) {
      const clusterSectionTemplate = window.TemplateUtils?.getTemplate('cluster-marker-section-template') || '';
      const clusterContent = marker.clusterMarkers.map((clusterMarker, index) => {
        const entryCount = clusterMarker.entries?.length || 0;
        return window.TemplateUtils?.fillTemplate(clusterSectionTemplate, {
          markerId: clusterMarker.id,
          markerName: clusterMarker.name || `Marker ${index + 1}`,
          index, entryCount,
          entryCountPlural: entryCount === 1 ? '' : 's'
        }) || '';
      }).join('');
      
      const template = window.TemplateUtils?.getTemplate('popup-cluster-fallback-template') || '';
      return window.TemplateUtils?.fillTemplate(template, { title, clusterContent }) || '';
    }
    
    const template = window.TemplateUtils?.getTemplate('popup-marker-fallback-template') || 
                    window.TemplateUtils?.getTemplate('popup-fallback-template') || '';
    return window.TemplateUtils?.fillTemplate(template, {
      title, itemCount,
      itemCountPlural: itemCount === 1 ? '' : 's'
    }) || `<div class="popup-header"><h3>${title}</h3></div><div class="popup-content"><p>${itemCount} items</p></div>`;
  }

  // Syncs checkbox states between popup and the main marker data
  syncCheckboxStates(popup, marker) { window.ItemMarking?.syncCheckboxStates(popup, marker); }

  // Shows a brief "Popup Pinned!" message when a popup gets pinned
  showPinFeedback() {
    const feedback = Object.assign(document.createElement('div'), {
      textContent: 'Popup Pinned!',
      className: 'pinned-popup-counter'
    });
    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 3000);
  }

  // Removes all pinned popups and clears related storage and info boxes
  clearAllPinnedPopups() {
    this.pinnedPopups.clear();
    
    document.querySelectorAll('.popup-pinned, .item-info-box.pinned').forEach(popup => {
      popup.classList.add('popup-unpin-animation');
      setTimeout(() => popup.remove(), 200);
    });
    
    window.ItemInformationBox?.clearAllBoxes();
    window.PopupSaving?.getInstance()?.clearAllSaved();
  }

  // Returns how many popups are currently pinned
  getPinnedCount() { return this.pinnedPopups.size; }
  
  // Refreshes a pinned popup by removing it and creating a new one with updated content
  async refreshPinnedPopup(popup, marker) {
    const rect = popup.getBoundingClientRect();
    const popupData = {
      markerId: marker.id, 
      markerName: marker.name, 
      isCluster: marker.isCluster || false,
      position: { x: rect.left, y: rect.top }, 
      timestamp: Date.now()
    };
    
    this.pinnedPopups.delete(popup.id);
    popup.remove();
    
    const newPopup = await this.createRestoredPopup(marker, popupData);
    if (newPopup?.id) this.pinnedPopups.set(newPopup.id, popupData);
  }
  
  // Unpins a specific popup by removing it and firing an unpin event
  unpinPopupByElement(popupElement) {
    const popupId = popupElement.id;
    const popupData = this.pinnedPopups.get(popupId);
    
    this.pinnedPopups.delete(popupId);
    popupElement.classList.add('popup-unpin-animation');
    setTimeout(() => popupElement.remove(), 200);
    
    if (popupData) {
      document.dispatchEvent(new CustomEvent('popup-unpinned', {
        detail: { popup: popupElement, popupData }
      }));
    } else {
      console.warn('No popup data found for unpinning:', popupId);
    }
  }
  
  // Just calls unpinPopupByElement - same thing really
  unpinPopup(popupElement) { this.unpinPopupByElement(popupElement); }
}

let popupPinningInstance = null;
const getPopupPinningInstance = () => popupPinningInstance ??= new PopupPinning();

window.handleCheckboxClick = (...args) => window.ItemMarking?.handleCheckboxClick(...args);
window.PopupPinning = {
  getInstance: getPopupPinningInstance,
  makePopupDraggable: (popup, marker) => getPopupPinningInstance().makePopupDraggable(popup, marker),
  clearAll: () => getPopupPinningInstance().clearAllPinnedPopups(),
  getPinnedCount: () => getPopupPinningInstance().getPinnedCount(),
  handleCheckboxClick: (...args) => window.ItemMarking?.handleCheckboxClick(...args)
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(getPopupPinningInstance, 100);
  
  const clearPinsBtn = document.getElementById('clear-pinned-btn');
  if (!clearPinsBtn) return;
  
  const instance = getPopupPinningInstance();
  clearPinsBtn.onclick = () => {
    const popupCount = instance.getPinnedCount();
    const infoBoxCount = window.ItemInformationBox?.getPinnedBoxCount?.() || 0;
    const totalCount = popupCount + infoBoxCount;
    
    if (totalCount === 0) return alert('No pinned items to clear.');
    
    const parts = [];
    if (popupCount > 0) parts.push(`${popupCount} popup${popupCount === 1 ? '' : 's'}`);
    if (infoBoxCount > 0) parts.push(`${infoBoxCount} info box${infoBoxCount === 1 ? '' : 'es'}`);
    
    if (confirm(`Clear all pinned items (${parts.join(' and ')})?`)) {
      instance.clearAllPinnedPopups();
    }
  };

  setInterval(() => {
    const popupCount = instance.getPinnedCount();
    const infoBoxCount = window.ItemInformationBox?.getPinnedBoxCount?.() || 0;
    const totalCount = popupCount + infoBoxCount;
    
    if (totalCount > 0) {
      const parts = [];
      if (popupCount > 0) parts.push(`${popupCount} popup${popupCount === 1 ? '' : 's'}`);
      if (infoBoxCount > 0) parts.push(`${infoBoxCount} info box${infoBoxCount === 1 ? '' : 'es'}`);
      clearPinsBtn.textContent = `📌 Clear Pins (${parts.join(', ')})`;
    } else {
      clearPinsBtn.textContent = '📌 Clear Pins';
    }
    
    clearPinsBtn.disabled = totalCount === 0;
  }, 1000);
});
