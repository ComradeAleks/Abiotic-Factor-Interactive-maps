let currentMap = null;
let currentMapLayers = [];
let leafletMap = null;
let mapImageSizes = {};
let allMaps = [];
let currentMapPath = [];

window.pinnedPopupsLoaded = false;

// Loads map image sizes from the server for proper scaling
fetch("/api/map-sizes")
  .then(res => res.json())
  .then(sizes => mapImageSizes = sizes)
  .catch(err => console.error("Failed to load map sizes:", err));

// Initializes the map system when the page loads
document.addEventListener("DOMContentLoaded", async () => {
  const tabContainer = document.getElementById("map-tabs");
  
  try {
    const maps = await fetch("/api/maps").then(res => res.json());
    if (!maps.length) return tabContainer.innerText = "No maps found.";
    allMaps = maps;
    const lastMap = localStorage.getItem("lastMapUsed");
    showMapTabs(maps, tabContainer);
    
    if (lastMap) {
      const mapData = findMapDataByPath(maps, lastMap);
      if (mapData) {
        loadMap(lastMap);
        return;
      }
    }
    
    const firstMap = findFirstMap(maps);
    if (firstMap) loadMap(firstMap);
    
  } catch (err) {
    tabContainer.innerText = "Failed to load maps.";
    console.error("Error loading maps:", err);
  }
});

// Creates the map tab interface showing available maps and folders
function showMapTabs(maps, container) {
  container.innerHTML = "";
  
  if (currentMapPath.length > 0) {
    const backButton = document.createElement("div");
    backButton.className = "map-tab back-button";
    backButton.innerHTML = "← Back";
    backButton.title = "Go back";
    backButton.addEventListener("click", () => {
      currentMapPath.pop();
      const parentMaps = getCurrentLevelMaps();
      showMapTabs(parentMaps, container);
    });
    container.appendChild(backButton);
  }
  
  maps.forEach(item => {
    if (item.type === "map") {
      const tab = Object.assign(document.createElement("img"), {
        className: "map-tab",
        src: `/maps/${item.path}`,
        alt: item.name,
        title: item.name
      });
      tab.addEventListener("click", () => loadMap(item.path));
      container.appendChild(tab);
    } else if (item.type === "folder") {
      const firstMapPath = findFirstMap(item.maps);
      const tabContainer = document.createElement("div");
      tabContainer.className = "map-tab folder-tab";
      tabContainer.style.position = "relative";
      tabContainer.title = `${item.name} (${item.mapCount} maps)`;
      
      const tab = Object.assign(document.createElement("img"), {
        src: firstMapPath ? `/maps/${firstMapPath}` : '/data/assets/Unknown.png',
        alt: item.name,
        style: "width: 100%; height: 100%; object-fit: cover;"
      });
      
      const overlay = document.createElement("div");
      overlay.className = "folder-overlay";
      overlay.textContent = item.name;
      
      const countIndicator = document.createElement("div");
      countIndicator.className = "map-count-indicator";
      countIndicator.textContent = item.mapCount;
      
      tabContainer.appendChild(tab);
      tabContainer.appendChild(overlay);
      tabContainer.appendChild(countIndicator);
      
      tabContainer.addEventListener("click", () => {
        currentMapPath.push(item.name);
        showMapTabs(item.maps, container);
        
        const firstMapInFolder = findFirstMap(item.maps);
        if (firstMapInFolder) {
          loadMap(firstMapInFolder);
        }
      });
      container.appendChild(tabContainer);
    }
  });
}

// Gets the maps at the current navigation level based on folder path
function getCurrentLevelMaps() {
  let currentLevel = allMaps;
  for (const pathSegment of currentMapPath) {
    const folder = currentLevel.find(item => item.type === "folder" && item.name === pathSegment);
    if (folder) {
      currentLevel = folder.maps;
    }
  }
  return currentLevel;
}

// Finds a specific map by its path in the map structure
function findMapDataByPath(maps, targetPath) {
  for (const map of maps) {
    if (map.type === "map" && map.path === targetPath) return map;
    if (map.type === "folder") {
      const nested = findMapDataByPath(map.maps, targetPath);
      if (nested) return nested;
    }
  }
  return null;
}

// Finds the first available map in a collection or folder
function findFirstMap(maps) {
  for (const map of maps) {
    if (map.type === "map") return map.path;
    if (map.type === "folder") {
      const nested = findFirstMap(map.maps);
      if (nested) return nested;
    }
  }
  return null;
}

// Loads and displays a specific map with proper Leaflet configuration
function loadMap(mapPath) {
  currentMap = mapPath;
  
  localStorage.setItem("lastMapUsed", mapPath);
  
  cleanupPreviousMap();
  
  const size = mapImageSizes[mapPath] || [1280, 720];
  const bounds = [[0, 0], [size[1], size[0]]];
  const buffer = 80;
  const maxBounds = [[-buffer, -buffer], [size[1] + buffer, size[0] + buffer]];

  leafletMap = L.map("leaflet-map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 4,
    zoomSnap: 0.1,
    zoomDelta: 0.2,
    maxBounds,
    maxBoundsViscosity: 1.0
  });

  leafletMap.fitBounds(bounds);
  
  const imageLayer = L.imageOverlay(`/maps/${mapPath}`, bounds).addTo(leafletMap);
  currentMapLayers = [imageLayer];

  imageLayer.on('load', async () => {
    leafletMap.fitBounds(bounds);
    
    if (typeof loadMarkersForMap === "function") {
      await loadMarkersForMap(mapPath, leafletMap, bounds);
      setupMarkerMerging();
    }
    if (window.InfoBoxSaveLoad && typeof window.InfoBoxSaveLoad.loadMarkerItemData === 'function') {
      await window.InfoBoxSaveLoad.loadMarkerItemData();
    }
  });

  Object.assign(window, { leafletMap, currentMap });
}

// Cleans up the previous map and removes all layers and markers
function cleanupPreviousMap() {
  if (!leafletMap) return;
  
  if (typeof hideMarkerPopup === 'function') hideMarkerPopup();
  
  if (window.markerMerging) {
    window.markerMerging.stopClustering();
    window.markerMerging.clearClusters();
    window.markerMerging = null;
  }
  
  if (window.leafletMarkers) {
    window.leafletMarkers.forEach(m => {
      if (leafletMap.hasLayer(m)) leafletMap.removeLayer(m);
    });
    window.leafletMarkers = [];
  }
  
  currentMapLayers = [];
  
  leafletMap.eachLayer(layer => leafletMap.removeLayer(layer));
  leafletMap.remove();
  leafletMap = null;
}

// Sets up marker clustering/merging functionality for the current map
function setupMarkerMerging() {
  if (typeof initializeMarkerMerging === "function") {
    window.markerMerging = initializeMarkerMerging(leafletMap);
    setTimeout(() => {
      if (typeof updateMarkersForMerging === "function") {
        updateMarkersForMerging();
      }
    }, 100);
  }
}
