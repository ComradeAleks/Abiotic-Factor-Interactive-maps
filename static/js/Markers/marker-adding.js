let addMode = false;
class MarkerAdder {
  // sets up the marker adding functionality when created
  constructor() {
    this.init();
  }

  // attaches event listeners to the add button and map canvas for marker creation
  init() {
    document.addEventListener("DOMContentLoaded", () => {
      const canvas = document.getElementById("leaflet-map");
      
      document.getElementById("add-marker-btn").onclick = () => this.toggleAddMode(canvas);
      canvas.addEventListener("click", e => this.handleMapClick(e, canvas));
    });
  }

  // switches between normal and marker-adding mode by changing cursor and state
  toggleAddMode(canvas) {
    addMode = !addMode;
    canvas.style.cursor = addMode ? "crosshair" : "default";
  }

  // creates a new marker when user clicks the map while in add mode
  async handleMapClick(e, canvas) {
    if (!addMode) return;
    console.log('Map clicked, creating marker...');
    
    const point = leafletMap.mouseEventToContainerPoint(e);
    const latlng = leafletMap.containerPointToLatLng(point);
    const popupPoint = { x: e.clientX, y: e.clientY };
    const selection = await openPresetSelector(popupPoint);
    if (!selection?.entries?.length) return;
    
    const marker = {
      id: Date.now(),
      map: currentMap,
      x: latlng.lng,
      y: latlng.lat,
      name: selection.name,
      entries: selection.entries
    };
    
    console.log('Created marker:', marker);
    console.log('NewMarkerFileHandler available:', !!window.NewMarkerFileHandler);
    console.log('MarkerDataUtils available:', !!window.MarkerDataUtils);
    
    try {
      await window.NewMarkerFileHandler.addMarker(marker);
      console.log('Marker added successfully');
    } catch (error) {
      console.error('Failed to add marker:', error);
    }
    
    this.toggleAddMode(canvas);
  }
}

new MarkerAdder();
