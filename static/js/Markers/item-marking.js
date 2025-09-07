class ItemMarking {
  // handles checkbox clicks for both regular and cluster items by updating their marked status
  static async handleCheckboxClick(checkbox, marker) {
    const item = checkbox.closest('.popup-item, .cluster-item');
    const isChecked = checkbox.checked;
    
    if (checkbox.classList.contains('cluster-item-check')) {
      const markerId = parseInt(item.dataset.markerId);
      const entryIndex = parseInt(item.dataset.entryIndex);
      const clusterMarker = marker.clusterMarkers?.find(m => m.id === markerId);
      
      if (clusterMarker && this.updateItemByIndex(clusterMarker, entryIndex, isChecked)) {
        item.classList.toggle('checked', isChecked);
        await this.saveMarkerChanges(clusterMarker);
      }
    } else if (checkbox.classList.contains('item-check')) {
      const entryIndex = parseInt(item.dataset.index);
      if (this.updateItemByIndex(marker, entryIndex, isChecked)) {
        item.classList.toggle('checked', isChecked);
        await this.saveMarkerChanges(marker);
      }
    }
    
    this.updateUI();
  }

  // finds and updates an item's marked status using its flat index across all entries
  static updateItemByIndex(marker, flatIndex, marked) {
    if (!marker.entries || !Array.isArray(marker.entries)) return false;
    
    let currentIndex = 0;
    for (const categoryGroup of marker.entries) {
      if (categoryGroup.items && Array.isArray(categoryGroup.items)) {
        for (const item of categoryGroup.items) {
          if (currentIndex === flatIndex) {
            item.marked = marked ? 1 : 0;
            return true;
          }
          currentIndex++;
        }
      }
    }
    return false;
  }

  // saves marker changes using the new handler or falls back to the old system
  static async saveMarkerChanges(marker) {
    if (window.NewMarkerFileHandler) {
      try {
        await window.NewMarkerFileHandler.saveMarker(marker);
      } catch (error) {
        console.error('New save method failed, falling back to old method:', error);
        await this.fallbackSave(marker);
      }
    } else {
      await this.fallbackSave(marker);
    }
  }

  // fallback method that uses the old marker saving system when new one fails
  static async fallbackSave(marker) {
    await window.MarkerDataUtils?.saveMarker(marker);
    await window.MarkerDataUtils?.updateMarkerIcon(marker);
    window.MarkerDataUtils?.updateGlobalMarker(marker);
  }

  // triggers all UI updates after marker changes to keep everything in sync
  static updateUI() {
    window.SidebarUtils?.updateSidebar();
    window.SidebarUtils?.triggerMarkerListUpdate();
    
    if (typeof renderMarkerList === 'function') renderMarkerList();
    
    if (typeof updateMarkersForMerging === 'function') updateMarkersForMerging();
  }

  // attaches the checkbox click handler to all checkboxes in a popup
  static attachCheckboxHandlers(popup, marker) {
    popup.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.removeEventListener('change', this.handleCheckboxClick);
      
      checkbox.addEventListener('change', async () => {
        await this.handleCheckboxClick(checkbox, marker);
      });
    });
  }

  // syncs checkbox states with the actual data for both regular and cluster items
  static syncCheckboxStates(popup, marker) {
    const syncItem = (item, checkedSelector, checkedValue) => {
      const checkbox = item.querySelector(checkedSelector);
      if (checkbox) checkbox.checked = checkedValue;
      item.classList.toggle('checked', checkedValue);
    };

    if (marker.entries && Array.isArray(marker.entries)) {
      popup.querySelectorAll('.popup-item').forEach((item, flatIndex) => {
        const itemData = this.getItemByFlatIndex(marker, flatIndex);
        if (itemData) {
          syncItem(item, '.item-check', itemData.marked === 1);
        }
      });
    }

    if (marker.isCluster && marker.clusterMarkers) {
      popup.querySelectorAll('.cluster-item').forEach(item => {
        const markerId = parseInt(item.dataset.markerId);
        const entryIndex = parseInt(item.dataset.entryIndex);
        const clusterMarker = marker.clusterMarkers.find(m => m.id === markerId);
        if (clusterMarker) {
          const itemData = this.getItemByFlatIndex(clusterMarker, entryIndex);
          if (itemData) {
            syncItem(item, '.cluster-item-check', itemData.marked === 1);
          }
        }
      });
    }
  }

  // retrieves an item object by its flat index position across all marker entries
  static getItemByFlatIndex(marker, flatIndex) {
    if (!marker.entries || !Array.isArray(marker.entries)) return null;
    
    let currentIndex = 0;
    for (const categoryGroup of marker.entries) {
      if (categoryGroup.items && Array.isArray(categoryGroup.items)) {
        for (const item of categoryGroup.items) {
          if (currentIndex === flatIndex) {
            return item;
          }
          currentIndex++;
        }
      }
    }
    return null;
  }
}

window.ItemMarking = ItemMarking;
window.handleCheckboxClick = ItemMarking.handleCheckboxClick.bind(ItemMarking);
window.updateUI = ItemMarking.updateUI.bind(ItemMarking);
