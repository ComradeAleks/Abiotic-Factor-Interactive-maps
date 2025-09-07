class NewMarkerFileHandler {
  constructor() {
  }

  // This function saves marker changes to the server and updates the map display
  async saveMarker(marker) {
    try {
      const orderedMarker = {
        id: marker.id,
        map: marker.map,
        x: marker.x,
        y: marker.y,
        name: marker.name || '',
        entries: marker.entries
      };

      const response = await fetch(`/api/markers/${marker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderedMarker)
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }

      this.updateGlobalMarker(orderedMarker);

      await this.updateMarkerIcon(orderedMarker);

      if (window.itemInformationBox && window.itemInformationBox.synchronizeMarkerData) {
        window.itemInformationBox.synchronizeMarkerData(orderedMarker);
      }

      this.refreshPopupsForMarker(orderedMarker);

      this.triggerGlobalUpdates();

      return orderedMarker;

    } catch (error) {
      console.error('Save error:', error);
      throw error;
    }
  }

  // This function creates a new marker and adds it to both the server and the map
  async addMarker(marker) {
    try {
      const response = await fetch("/api/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(marker)
      });

      if (!response.ok) {
        throw new Error(`Add failed: ${response.status}`);
      }

      if (!window.leafletMarkers) window.leafletMarkers = [];
      const leafletMarker = await window.MarkerUtils.createLeafletMarker(marker);
      if (leafletMarker) window.leafletMarkers.push(leafletMarker);

      if (typeof markers !== 'undefined') markers.push(marker);

      await this.updateMarkerIcon(marker);

      this.refreshPopupsForMarker(marker);
      
      this.triggerGlobalUpdates();
      return marker;

    } catch (error) {
      console.error('Add marker error:', error);
      throw error;
    }
  }

  // This function fetches all markers from the server
  async loadMarkers() {
    try {
      const response = await fetch("/api/markers");
      const markers = await response.json();
      
      return markers;

    } catch (error) {
      console.error('Load markers error:', error);
      return [];
    }
  }

  // This function removes a marker from both the server and the map
  async deleteMarker(marker) {
    try {
      const response = await fetch(`/api/markers/${marker.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      if (window.itemInformationBox && window.itemInformationBox.cleanupMarkerData) {
        window.itemInformationBox.cleanupMarkerData(marker.id);
      }

      this.removeFromMap(marker);
      this.triggerGlobalUpdates();
      return true;

    } catch (error) {
      console.error('Delete marker error:', error);
      throw error;
    }
  }

  // This function updates a marker in the global markers array
  updateGlobalMarker(marker) {
    if (typeof markers !== 'undefined') {
      const index = markers.findIndex(m => m.id === marker.id);
      if (index !== -1) markers[index] = marker;
    }
  }

  // This function updates the visual icon of a marker on the map
  async updateMarkerIcon(marker) {
    const leafletMarker = window.leafletMarkers?.find(lm => lm.markerData?.id === marker.id);
    if (leafletMarker && window.MarkerUtils) {
      leafletMarker.markerData = marker;

      const newIcon = await window.MarkerUtils.getIcon(marker);
      if (newIcon) {
        leafletMarker.setIcon(newIcon);
      }
      
      this.refreshMarkerHoverEvents(leafletMarker, marker);
    }
  }

  // This function resets hover events for markers when they change
  refreshMarkerHoverEvents(leafletMarker, marker) {
    leafletMarker.off('mouseover');
    leafletMarker.off('mouseout');
    
    const hasOnlyOneItem = marker.entries && marker.entries.length === 1;
    if (hasOnlyOneItem && window.MarkerUtils?.setupSingleItemHover) {
      window.MarkerUtils.setupSingleItemHover(leafletMarker, marker);
    }
  }


  // This function updates all open popups to show the latest marker data
  refreshPopupsForMarker(marker) {
    const regularPopup = document.getElementById('marker-popup');
    if (regularPopup && !regularPopup.classList.contains('hidden') && typeof getMarkerPopupInstance === 'function') {
      const popupInstance = getMarkerPopupInstance();
      if (popupInstance.currentMarker && popupInstance.currentMarker.id === marker.id) {
        popupInstance.currentMarker = marker;
        popupInstance.render();
        window.ItemMarking?.syncCheckboxStates(regularPopup, marker);
        window.ItemMarking?.attachCheckboxHandlers(regularPopup, marker);
        if (window.PopupPinning && !regularPopup.querySelector('.popup-drag-handle')) {
          window.PopupPinning.makePopupDraggable(regularPopup, marker);
        }
      }

      if (popupInstance.currentMarker?.isCluster && Array.isArray(popupInstance.currentMarker.clusterMarkers)) {
        const isInCluster = popupInstance.currentMarker.clusterMarkers.some(m => m.id === marker.id);
        if (isInCluster) {
          const clusterMarkerIndex = popupInstance.currentMarker.clusterMarkers.findIndex(m => m.id === marker.id);
          if (clusterMarkerIndex !== -1) {
            popupInstance.currentMarker.clusterMarkers[clusterMarkerIndex] = marker;
          }
          popupInstance.render();
          window.ItemMarking?.syncCheckboxStates(regularPopup, popupInstance.currentMarker);
          window.ItemMarking?.attachCheckboxHandlers(regularPopup, popupInstance.currentMarker);
          if (window.PopupPinning && !regularPopup.querySelector('.popup-drag-handle')) {
            window.PopupPinning.makePopupDraggable(regularPopup, popupInstance.currentMarker);
          }
        }
      }
    }

    if (window.PopupPinning?.getInstance) {
      const pinningInstance = window.PopupPinning.getInstance();
      document.querySelectorAll('.popup-pinned').forEach(pinnedPopup => {
        const markerId = pinnedPopup.dataset.markerId;
        if (markerId && parseInt(markerId) === marker.id) {
          pinningInstance.refreshPinnedPopup(pinnedPopup, marker);
        }
      });
    }
  }

  // This function removes a marker from the map and global arrays
  removeFromMap(marker) {
    if (window.leafletMarkers) {
      window.leafletMarkers = window.leafletMarkers.filter(lm => {
        if (lm.markerData?.id === marker.id) {
          if (typeof leafletMap !== 'undefined') leafletMap.removeLayer(lm);
          return false;
        }
        return true;
      });
    }
    if (typeof markers !== 'undefined') {
      const index = markers.findIndex(m => m.id === marker.id);
      if (index !== -1) markers.splice(index, 1);
    }
  }

  // This function updates all UI elements that depend on marker data
  triggerGlobalUpdates() {
    if (typeof renderMarkerList === 'function') renderMarkerList();
    if (typeof updateMarkersForMerging === 'function') updateMarkersForMerging();
    if (window.SidebarUtils?.updateSidebar) window.SidebarUtils.updateSidebar();
    if (window.SidebarUtils?.triggerMarkerListUpdate) window.SidebarUtils.triggerMarkerListUpdate();
  }
}

window.NewMarkerFileHandler = new NewMarkerFileHandler();