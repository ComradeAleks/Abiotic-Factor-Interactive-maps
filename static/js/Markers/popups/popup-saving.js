class PopupSavingSystem {
  // sets up the popup saving system with queues and timers
  constructor() {
    this.saveQueue = new Set();
    this.isLoading = false;
    this.saveTimer = null;
    this.SAVE_DELAY = 1000;
    
    this.setupEventListeners();
  }

  // listens for popup events like pinning, unpinning, and moving
  setupEventListeners() {
    document.addEventListener('popup-pinned', (e) => {
      this.onPopupPinned(e.detail);
    });
    
    document.addEventListener('popup-unpinned', (e) => {
      this.onPopupUnpinned(e.detail);
    });
    
    document.addEventListener('popup-moved', (e) => {
      this.onPopupMoved(e.detail);
    });
  }

  // saves popup position when it gets pinned
  onPopupPinned(detail) {
    const { popup, marker, position } = detail;
    this.queueSave(marker, position, true);
  }

  // removes popup from saved data when it gets unpinned
  onPopupUnpinned(detail) {
    const { popupData } = detail;
    
    if (popupData && popupData.markerId) {
      let markerIDs;
      
      if (popupData.isCluster && typeof popupData.markerId === 'string') {
        if (popupData.markerId.startsWith('cluster-')) {
          const idString = popupData.markerId.replace('cluster-', '');
          markerIDs = idString.split('-').map(id => parseInt(id, 10));
        } else if (popupData.markerId.startsWith('cluster_')) {
          this.findAndRemoveByPosition(popupData.position);
          return;
        } else {
          markerIDs = [parseInt(popupData.markerId, 10)];
        }
      } else if (Array.isArray(popupData.markerId)) {
        markerIDs = popupData.markerId;
      } else {
        markerIDs = [popupData.markerId];
      }
      
      const removeData = { markerID: markerIDs, remove: true };
      this.saveQueue.add(JSON.stringify(removeData));
      
      this.forceSave();
    } else {
    }
  }

  // finds and removes popups by their screen position when marker ID isn't available
  async findAndRemoveByPosition(position) {
    try {
      const response = await fetch('/api/load-pinned-popups');
      if (!response.ok) {
        console.error('Failed to load current popups for removal');
        return;
      }
      
      const savedPopups = await response.json();
      
      const matchingPopup = savedPopups.find(popup => 
        Math.abs(popup.x - position.x) < 10 && Math.abs(popup.y - position.y) < 10
      );
      
      if (matchingPopup) {
        const removeData = { markerID: matchingPopup.markerID, remove: true };
        this.saveQueue.add(JSON.stringify(removeData));
        
        this.forceSave();
      } else {
      }
    } catch (error) {
    }
  }

  // saves popup position when it gets moved around
  onPopupMoved(detail) {
    const { popup, marker, position } = detail;
    this.queueSave(marker, position, true);
  }

  // adds popup data to save queue, either immediately or with delay
  queueSave(marker, position, immediate = false) {
    if (!marker || !position) return;
    
    const saveData = this.createSaveData(marker, position);
    this.saveQueue.add(JSON.stringify(saveData));
    
    if (immediate) {
      this.forceSave();
    } else {
      this.debouncedSave();
    }
  }

  // adds marker removal request to save queue
  queueRemove(marker) {
    if (!marker) return;
    
    const removeData = { markerID: this.getMarkerID(marker), remove: true };
    this.saveQueue.add(JSON.stringify(removeData));
    this.debouncedSave();
  }

  // creates save data object with marker ID, position and timestamp
  createSaveData(marker, position) {
    const markerID = this.getMarkerID(marker);
    return {
      markerID: markerID,
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      timestamp: Date.now()
    };
  }

  // gets marker ID, handles both single markers and clusters
  getMarkerID(marker) {
    if (marker.isCluster && marker.clusterMarkers) {
      return marker.clusterMarkers.map(m => m.id);
    } else {
      return [marker.id];
    }
  }

  // delays saving by 1 second to avoid too many API calls
  debouncedSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => {
      this.performSave();
    }, this.SAVE_DELAY);
  }

  // sends all queued save data to the server
  async performSave() {
    if (this.saveQueue.size === 0 || this.isLoading) return;
    
    try {
      const saveData = Array.from(this.saveQueue).map(item => JSON.parse(item));
      this.saveQueue.clear();
      
      const response = await fetch('/api/save-pinned-popups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(saveData)
      });
      
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
      
      const result = await response.json();
      
    } catch (error) {
      console.error('Failed to save pinned popups:', error);
    }
  }

  // loads all saved popup positions from server and restores them
  async loadPinnedPopups() {
    if (this.isLoading) {
      return;
    }
    
    this.isLoading = true;
    
    try {
      const response = await fetch('/api/load-pinned-popups');
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      
      const pinnedData = await response.json();
      
      if (!pinnedData || pinnedData.length === 0) {
        return;
      }
      
      for (let i = 0; i < pinnedData.length; i++) {
        const data = pinnedData[i];
        await this.restorePopup(data);
        
        if (i < pinnedData.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
    } catch (error) {
      console.error('Failed to load pinned popups:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // recreates a single popup from saved data at its saved position
  async restorePopup(data) {
    
    if (!data.markerID || typeof data.x !== 'number' || typeof data.y !== 'number') {
      console.warn('Invalid popup data:', data);
      return;
    }
    
    let markerIdToCheck = data.markerID;
    
    if (Array.isArray(data.markerID) && data.markerID.length > 0) {
      markerIdToCheck = data.markerID[0];
    }
    
    if (typeof markerIdToCheck === 'string' && markerIdToCheck.startsWith('info-box-')) {
      
      const itemKey = markerIdToCheck.replace('info-box-', '');
      
      const infoBoxData = {
        type: 'info-box',
        itemKey: itemKey,
        markerName: data.markerName || 'Unknown Item',
        position: { x: data.x, y: data.y },
        timestamp: data.timestamp || Date.now()
      };
      
      const waitForInfoBox = async () => {
        let attempts = 0;
        while (!window.ItemInformationBox?.restoreInfoBox && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        return window.ItemInformationBox?.restoreInfoBox;
      };
      
      const restoreMethod = await waitForInfoBox();
      if (restoreMethod) {
        try {
          await restoreMethod(infoBoxData);
        } catch (error) {
          console.error('Failed to restore information box:', error);
        }
      } else {
        console.error('ItemInformationBox.restoreInfoBox not available after waiting');
      }
      return;
    }
    
    try {
      const marker = await this.findMarkerByID(data.markerID);
      
      if (!marker) {
        console.warn('Marker not found for ID:', data.markerID);
        return;
      }

      if (marker.map && marker.map !== window.currentMap && window.InfoBoxSaveLoad) {
        console.log(`Preloading item data for marker's map: ${marker.map}`);
        await window.InfoBoxSaveLoad.loadItemDataForMap(marker.map);
      }
      
      const position = { x: data.x, y: data.y };
      
      const pinningInstance = window.PopupPinning?.getInstance();
      if (pinningInstance) {
        
        const popupData = {
          markerId: Array.isArray(data.markerID) ? data.markerID[0] : data.markerID,
          markerName: marker.name,
          isCluster: marker.isCluster || false,
          position: position,
          timestamp: data.timestamp || Date.now()
        };
        
        
        const restoredPopup = await pinningInstance.createRestoredPopup(marker, popupData);
      } else {
        console.error('PopupPinning instance not available');
      }
      
    } catch (error) {
      console.error('Failed to restore popup:', error);
    }
  }

  // finds a marker by its ID, searches current map first then all maps
  async findMarkerByID(markerID) {
    
    const findSingleMarker = async (id) => {
      if (window.markers) {
        const found = window.markers.find(m => m.id === id);
        if (found) return found;
      }
      
      try {
        const response = await fetch('/api/markers');
        if (response.ok) {
          const allMarkers = await response.json();
          return allMarkers.find(m => m.id === id);
        }
      } catch (error) {
        console.warn('Error searching all maps for marker:', error);
      }
      
      return null;
    };
    
    if (Array.isArray(markerID)) {
      
      if (markerID.length === 1) {
        return await findSingleMarker(markerID[0]);
      } else {
        const clusterMarkers = [];
        for (const id of markerID) {
          const marker = await findSingleMarker(id);
          if (marker) {
            clusterMarkers.push(marker);
          }
        }
        
        if (clusterMarkers.length === 0) {
          return null;
        }
        
        const cluster = {
          id: `cluster-${markerID.join('-')}`,
          name: `Cluster (${clusterMarkers.length} items)`,
          isCluster: true,
          clusterMarkers: clusterMarkers,
          x: clusterMarkers[0].x,
          y: clusterMarkers[0].y,
          map: clusterMarkers[0].map,
          entries: clusterMarkers.flatMap(m => m.entries || [])
        };
        
        return cluster;
      }
    } else {
      return await findSingleMarker(markerID);
    }
  }

  // forces immediate save of all queued data without waiting
  async forceSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.performSave();
  }

  // clears all saved popup data from the server
  async clearAllSaved() {
    try {
      const response = await fetch('/api/save-pinned-popups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([])
      });
      
      if (!response.ok) {
        throw new Error(`Clear failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to clear pinned popups:', error);
    }
  }
}

let popupSavingInstance = null;

// creates or returns the existing popup saving instance
function getPopupSavingInstance() {
  if (!popupSavingInstance) {
    popupSavingInstance = new PopupSavingSystem();
  }
  return popupSavingInstance;
}

window.PopupSaving = {
  getInstance: getPopupSavingInstance,
  loadPinnedPopups: () => getPopupSavingInstance().loadPinnedPopups(),
  forceSave: () => getPopupSavingInstance().forceSave(),
  clearAllSaved: () => getPopupSavingInstance().clearAllSaved()
};

document.addEventListener('DOMContentLoaded', () => {
  getPopupSavingInstance();
});

window.addEventListener('beforeunload', () => {
  const instance = getPopupSavingInstance();
  if (instance) {
    instance.forceSave();
  }
});
