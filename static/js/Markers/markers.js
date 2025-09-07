let markers = [];

const MarkerUtils = {
  // checks if a marker should be visible based on category filter settings
  isVisible(marker) {
    if (!categoryState) return true;
    return marker.entries.some(entry => this.shouldShowEntry(entry));
  },

  // determines if an individual entry should be shown based on its category and subcategory states
  shouldShowEntry(entry) {
    if (!categoryState) return true;
    
    const category = entry.category || "Unknown";
    const catState = categoryState[category];
    return !catState || (entry.subcategory ? catState.subcategories?.[entry.subcategory] : catState.enabled);
  },

  // gets the appropriate icon for a marker by finding the right item to display
  async getIcon(marker) {
    const visibleEntries = marker.entries.filter(entry => this.shouldShowEntry(entry));
    if (!visibleEntries.length) return null;
    
    let displayItem = null;
    let allCompleted = true;
    
    for (const categoryGroup of visibleEntries) {
      if (!categoryGroup.items || !Array.isArray(categoryGroup.items)) continue;
      for (const item of categoryGroup.items) {
        if (item.marked !== 1) {
          allCompleted = false;
          if (!displayItem || displayItem.marked) {
            displayItem = {
              category: categoryGroup.category,
              subcategory: categoryGroup.subcategory,
              itemName: item.itemname,
              marked: false
            };
          }
        } else {
          if (!displayItem) {
            displayItem = {
              category: categoryGroup.category,
              subcategory: categoryGroup.subcategory,
              itemName: item.itemname,
              marked: true
            };
          }
        }
      }
    }
    if (!displayItem?.itemName) return null;

    const category = displayItem.category || "Unknown";
    const subcategory = displayItem.subcategory;
    
    let img;
    const fetchedImage = await fetchImageForItem(displayItem.itemName, category, subcategory);
    
    if (fetchedImage && (fetchedImage.startsWith('http://') || fetchedImage.startsWith('https://'))) {
      img = fetchedImage;
    } else {
      const imageName = `${displayItem.itemName}.png`;
      if (subcategory && subcategory !== "Unknown" && subcategory !== "") {
        img = window.ImageLoader.getImageSrc(category, subcategory, imageName);
      } else {
        img = window.ImageLoader.getImageSrc(category, "", imageName);
      }
    }
    
    return L.icon({
      iconUrl: img,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: 'auto-size' + (allCompleted ? ' marker-completed' : '')
    });
  },

  // creates the actual leaflet marker with click events and hover behavior for single items
  async createLeafletMarker(marker) {
    const icon = await this.getIcon(marker);
    if (!icon) return null;
    
    const leafletMarker = L.marker([marker.y, marker.x], { icon }).addTo(leafletMap);
    leafletMarker.markerData = marker;
    leafletMarker.on("click", async () => await openUniversalPopup(marker, leafletMap));
    
    let totalItems = 0;
    if (marker.entries) {
      marker.entries.forEach(categoryGroup => {
        if (categoryGroup.items && Array.isArray(categoryGroup.items)) {
          totalItems += categoryGroup.items.length;
        } else if (categoryGroup.name || categoryGroup.itemname) {
          totalItems += 1;
        }
      });
    }
    
    const hasOnlyOneItem = totalItems === 1;
    if (hasOnlyOneItem) {
      let hoverTimeout = null;
      
      leafletMarker.on("mouseover", async (e) => {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
        }
        
        hoverTimeout = setTimeout(async () => {
          const currentMarker = e.target.markerData || marker;
          const itemData = currentMarker.entries[0];
          
          let itemName = null;
          if (itemData) {
            if (itemData.name) {
              itemName = itemData.name;
            } else if (itemData.items && itemData.items.length > 0) {
              const firstItem = itemData.items[0];
              itemName = firstItem.itemname || firstItem.name || firstItem.title;
            } else {
              itemName = itemData.itemname || itemData.title || itemData.label || itemData.item;
            }
          }
          
          if (itemName && window.ItemInformationBox?._instance) {
            try {
              const instance = window.ItemInformationBox._instance;
              
              const itemKey = window.InfoBoxData ? 
                window.InfoBoxData.createItemKey(marker.id, itemName) : 
                `${marker.id}_${itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
              
              if (window.InfoBoxHoverState && window.InfoBoxHoverState.hasActiveHover(itemKey)) {
                return;
              }
              
              if (window.ItemInformationBoxManager?.instances?.has(itemKey)) {
                const existingInstance = window.ItemInformationBoxManager.instances.get(itemKey);
                if (existingInstance && existingInstance.isVisible) {
                  if (existingInstance.hideTimeout) {
                    clearTimeout(existingInstance.hideTimeout);
                    existingInstance.hideTimeout = null;
                  }
                  if (window.InfoBoxHoverState) {
                    window.InfoBoxHoverState.addHover(itemKey);
                    window.InfoBoxHoverState.clearTimeout(itemKey);
                  }
                  return;
                }
              }
              
              if (window.InfoBoxHoverState) {
                window.InfoBoxHoverState.addHover(itemKey);
              }
              
              const markerInfo = {
                markerId: marker.id,
                itemIndex: 0,
                itemName: itemName
              };

              const markerLatLng = L.latLng(currentMarker.y, currentMarker.x);
              const markerPixel = leafletMap.latLngToContainerPoint(markerLatLng);

              const position = {
                clientX: markerPixel.x + 170,
                clientY: markerPixel.y + 250
              };

              await instance.showForMarkerItem(markerInfo, position);
            } catch (error) {
              console.error("Error creating/using InfoBox:", error);
            }
          }
        }, 1000);
      });
      
      leafletMarker.on("mouseout", (e) => {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
        
        const currentMarker = e.target.markerData || marker;
        const itemData = currentMarker.entries[0];
        let itemName = null;
        if (itemData) {
          if (itemData.name) {
            itemName = itemData.name;
          } else if (itemData.items && itemData.items.length > 0) {
            const firstItem = itemData.items[0];
            itemName = firstItem.itemname || firstItem.name || firstItem.title;
          } else {
            itemName = itemData.itemname || itemData.title || itemData.label || itemData.item;
          }
        }
        
        if (itemName && window.ItemInformationBox?._instance) {
          try {
            const instance = window.ItemInformationBox._instance;
            
            const itemKey = window.InfoBoxData ? 
              window.InfoBoxData.createItemKey(marker.id, itemName) : 
              `${marker.id}_${itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
            
            if (window.InfoBoxHoverState) {
              window.InfoBoxHoverState.removeHover(itemKey);
            }
            
            if (instance && !instance.isPinned) {
              if (instance.hideTimeout) {
                clearTimeout(instance.hideTimeout);
              }
              instance.hideTimeout = setTimeout(() => {
                if (!instance.isPinned) {
                  instance.hide();
                }
              }, 500);
              
              if (window.InfoBoxHoverState) {
                window.InfoBoxHoverState.setTimeout(itemKey, instance.hideTimeout);
              }
            }
          } catch (error) {
            console.error("Error hiding InfoBox on mouseout:", error);
          }
        }
      });
    }
    
    return leafletMarker;
  }
};

const MarkerDataUtils = {
  // saves changes to an existing marker to the server
  async saveMarker(marker) {
    if (!marker.entries?.length) {
      console.error('Cannot save marker: invalid entries', marker);
      return;
    }
    try {
      return await window.NewMarkerFileHandler.saveMarker(marker);
    } catch (error) {
      console.error('Save error:', error);
    }
  },

  // adds a completely new marker to the map and server
  async addMarker(marker) {
    try {
      return await window.NewMarkerFileHandler.addMarker(marker);
    } catch (error) {
      console.error('Add marker error:', error);
      throw error;
    }
  },

  // updates a marker in the global markers array when it gets changed
  updateGlobalMarker(marker) {
    if (typeof markers !== 'undefined') {
      const index = markers.findIndex(m => m.id === marker.id);
      if (index !== -1) markers[index] = marker;
    }
  },

  // refreshes a marker's icon on the map when its data changes
  async updateMarkerIcon(marker) {
    const leafletMarker = window.leafletMarkers?.find(lm => lm.markerData?.id === marker.id);
    if (leafletMarker && typeof getMarkerIcon === 'function') {
      const icon = await getMarkerIcon(marker);
      if (icon) leafletMarker.setIcon(icon);
    }
  },

  // completely removes a marker from the map and all data arrays
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
    if (typeof updateMarkersForMerging === 'function') updateMarkersForMerging();
  },

  // triggers various global update functions to refresh the UI after marker changes
  triggerGlobalUpdates() {
    ['renderMarkerList', 'updateMarkersForMerging'].forEach(fn => {
      if (typeof window[fn] === 'function') window[fn]();
    });
  }
};

// wrapper functions that call the utility methods for backwards compatibility
function isMarkerVisible(marker) { return MarkerUtils.isVisible(marker); }
async function getMarkerIcon(marker) { return await MarkerUtils.getIcon(marker); }
function saveMarker(marker) { return MarkerDataUtils.saveMarker(marker); }
async function updateMarkerIcon(marker) { return await MarkerDataUtils.updateMarkerIcon(marker); }

window.MarkerDataUtils = MarkerDataUtils;

window.MarkerUtils = MarkerUtils;

// clears existing markers and adds new ones based on visibility and map filters
async function clearAndAddMarkers({ mapName, leafletMap, filterMap = true }) {
  if (window.leafletMarkers) {
    window.leafletMarkers.forEach(m => {
      if (leafletMap.hasLayer(m)) leafletMap.removeLayer(m);
    });
  }
  window.leafletMarkers = [];

  const visibleMarkers = markers.filter(m => (!filterMap || m.map === mapName) && MarkerUtils.isVisible(m));
  
  for (const marker of visibleMarkers) {
    if (!marker.entries?.length) continue;
    const leafletMarker = await MarkerUtils.createLeafletMarker(marker);
    if (leafletMarker) window.leafletMarkers.push(leafletMarker);
  }
}

// refreshes all markers on the current map by clearing and re-adding them
async function refreshMapMarkers() {
  if (!leafletMap || !markers || !window.leafletMarkers) return;

  await clearAndAddMarkers({ mapName: currentMap, leafletMap, filterMap: true });

  if (window.markerClusterGroup) {
    window.markerClusterGroup.clearLayers();
    leafletMap.removeLayer(window.markerClusterGroup);
  }

  if (typeof initializeClustering === 'function') initializeClustering();
}

// loads all markers for a specific map from the server and sets up event handlers
async function loadMarkersForMap(mapName, leafletMap, bounds) {
  try {
    const response = await fetch(`/api/markers?map=${encodeURIComponent(mapName)}`);
    markers = await response.json();

    await clearAndAddMarkers({ mapName, leafletMap, filterMap: true });

    renderMarkerList();
    
    if (typeof window.setupAddModeHandlers === 'function') {
      window.setupAddModeHandlers();
    }

    if (window.PopupSaving && typeof window.PopupSaving.loadPinnedPopups === 'function' && !window.pinnedPopupsLoaded) {
      
      window.markers = markers;
      
      setTimeout(() => {
        window.PopupSaving.loadPinnedPopups();
        window.pinnedPopupsLoaded = true;
      }, 500);
    }
    
    return Promise.resolve();
  } catch (error) {
    console.error('Load markers error:', error);
    markers = [];
    return Promise.resolve();
  }
}
