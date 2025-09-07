class MarkerMerging {
  // sets up marker clustering with zoom limits and overlap settings
  constructor(map) {
    this.map = map;
    this.clusters = [];
    this.clusterMarkers = [];
    this.isActive = false;
    this.iconSize = 32;
    this.overlapThreshold = 0.3;
    this.zoomRange = { min: -2, max: 3 };
    
    this.map.on('zoomend moveend', () => this.handleMapChange());
  }

  // triggers clustering update when markers change with a small delay
  setMarkers(markers) {
    setTimeout(() => this.handleMapChange(), 300);
  }

  // decides whether to start, stop, or update clustering based on zoom changes
  handleMapChange() {
    const shouldCluster = this.shouldCluster();
    if (shouldCluster !== this.isActive) {
      shouldCluster ? this.startClustering() : this.stopClustering();
    } else if (shouldCluster) {
      this.updateClusters();
    }
  }

  // checks if current zoom level is within the clustering range
  shouldCluster() {
    const zoom = this.map.getZoom();
    return zoom >= this.zoomRange.min && zoom <= this.zoomRange.max;
  }

  // begins clustering by creating clusters and swapping individual markers for cluster markers
  startClustering() {
    this.isActive = true;
    this.createClusters();
    this.hideClusteredMarkers();
    this.showClusterMarkers();
  }

  // stops clustering and returns to showing individual markers
  stopClustering() {
    this.isActive = false;
    this.hideClusterMarkers();
    this.clearClusters();
    this.showOriginalMarkers();
  }

  // refreshes clusters when map moves but clustering should stay active
  updateClusters() {
    this.showOriginalMarkers();
    this.hideClusterMarkers();
    this.createClusters();
    this.hideClusteredMarkers();
    this.showClusterMarkers();
  }

  // groups overlapping markers into clusters by checking pixel distances
  createClusters() {
    this.clearClusters();
    if (!window.leafletMarkers?.length) return;
    
    const unprocessed = [...window.leafletMarkers];
    this.clusters = [];
    
    while (unprocessed.length > 0) {
      const cluster = [unprocessed.shift()];
      for (let i = unprocessed.length - 1; i >= 0; i--) {
        if (this.areOverlapping(cluster[0], unprocessed[i])) {
          cluster.push(unprocessed.splice(i, 1)[0]);
        }
      }
      if (cluster.length > 1) {
        this.clusters.push(cluster);
      }
    }
    this.createClusterMarkers();
  }

  // checks if two markers overlap on screen based on their pixel positions
  areOverlapping(m1, m2) {
    const p1 = this.map.latLngToContainerPoint(m1.getLatLng());
    const p2 = this.map.latLngToContainerPoint(m2.getLatLng());
    const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    return distance <= this.iconSize * (1 - this.overlapThreshold);
  }

  // creates visual cluster markers for each group of overlapping markers
  createClusterMarkers() {
    this.clusterMarkers = this.clusters.map(cluster => this.createClusterMarker(cluster));
  }

  // makes a single cluster marker with count, color, and click popup for a group of markers
  createClusterMarker(cluster) {
    const lats = cluster.map(m => m.getLatLng().lat);
    const lngs = cluster.map(m => m.getLatLng().lng);
    const centerLat = lats.reduce((a, b) => a + b) / lats.length;
    const centerLng = lngs.reduce((a, b) => a + b) / lngs.length;
    
    const categories = new Set();
    const markers = [];
    cluster.forEach(marker => {
      if (marker.markerData && !markers.includes(marker.markerData)) {
        markers.push(marker.markerData);
        marker.markerData.entries.forEach(entry => 
          categories.add(entry.category || entry.type || 'Unknown')
        );
      }
    });

    const size = Math.min(50, Math.max(30, 20 + cluster.length * 2));
    const color = this.getClusterColor([...categories]);
    
    const clusterMarker = L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        html: `<div class="cluster-marker" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.max(12, size * 0.3)}px">${cluster.length}</div>`,
        className: 'cluster-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      })
    });
    
    clusterMarker.on('click', () => this.showClusterPopup(cluster, markers));
    return clusterMarker;
  }

  // picks a color for cluster markers based on the categories they contain
  getClusterColor(categories) {
    const colors = {
      'Armor and Gear': '#4CAF50', 'Weapons and Ammo': '#F44336',
      'Resources and Sub-components': '#FF9800', 'Tools': '#2196F3',
      'Food and Cooking': '#9C27B0', 'Health and Medical': '#E91E63',
      'Base Defense': '#795548', 'Light and Power': '#FFEB3B',
      'Travel and Vehicles': '#00BCD4', 'Furniture and Benches': '#8BC34A',
      'Farming': '#4CAF50', 'Unknown': '#607D8B'
    };
    return categories.length === 1 ? 
      colors[categories[0]] || '#607D8B' : 
      'linear-gradient(45deg, #2196F3, #FF9800)';
  }

  // opens a popup showing all markers in a cluster when clicked
  showClusterPopup(cluster, markers) {
    if (typeof openClusterPopup === 'function') {
      openClusterPopup(cluster, markers, this.map);
    } else {
      console.error('openClusterPopup function not available');
    }
  }

  // removes individual markers that are now part of clusters from the map
  hideClusteredMarkers() {
    this.clusters.forEach(cluster => {
      cluster.forEach(marker => this.map.hasLayer(marker) && this.map.removeLayer(marker));
    });
  }

  // shows all individual markers back on the map
  showOriginalMarkers() {
    window.leafletMarkers?.forEach(marker => 
      !this.map.hasLayer(marker) && this.map.addLayer(marker)
    );
  }

  // removes cluster markers from the map
  hideClusterMarkers() {
    this.clusterMarkers.forEach(marker => 
      this.map.hasLayer(marker) && this.map.removeLayer(marker)
    );
  }

  // adds cluster markers to the map
  showClusterMarkers() {
    this.clusterMarkers.forEach(marker => this.map.addLayer(marker));
  }

  // cleans up all cluster data and removes cluster markers
  clearClusters() {
    this.hideClusterMarkers();
    this.clusterMarkers = [];
    this.clusters = [];
  }
}

let markerMerging = null;

// creates and returns a new marker merging instance for the given map
function initializeMarkerMerging(map) {
  markerMerging = new MarkerMerging(map);
  return markerMerging;
}

// tells the merging system that markers have changed and need reclustering
function updateMarkersForMerging() {
  markerMerging?.setMarkers(window.leafletMarkers);
}

window.markerMerging = markerMerging;
window.initializeMarkerMerging = initializeMarkerMerging;
window.updateMarkersForMerging = updateMarkersForMerging;
