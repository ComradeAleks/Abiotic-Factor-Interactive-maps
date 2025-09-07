class MarkerPopup {
  // sets up the popup system with templates and initialization
  constructor() {
    this.popup = null;
    this.templates = {};
    this.currentMarker = null;
    this.lastPosition = null;
    this.initialized = false;
    this.initPromise = this.init();
  }

  // loads HTML templates and sets up the popup system
  async init() {
    if (this.initialized) return;
    
    try {
      const templateUrls = {
        popup: '/static/templates/marker-popup-template.html',
        clusterItem: '/static/templates/cluster-item-template.html',
        clusterMarker: '/static/templates/cluster-marker-template.html'
      };

      const templateTexts = await window.TemplateUtils.loadTemplates(templateUrls);
      
      const popupData = window.TemplateUtils.parseHTMLTemplate(templateTexts.popup);
      
      this.templates = {
        main: popupData.main,
        item: popupData.templates['popup-item-template'],
        clusterItem: templateTexts.clusterItem,
        clusterMarker: templateTexts.clusterMarker
      };
      
      this.createPopup();
      this.setupGlobalListeners();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize MarkerPopup:', error);
    }
  }

  // creates the popup element and adds it to the page
  createPopup() {
    this.popup = Object.assign(document.createElement('div'), {
      id: 'marker-popup',
      className: 'marker-popup hidden'
    });
    document.body.appendChild(this.popup);
  }

  // sets up click and keyboard events to hide the popup
  setupGlobalListeners() {
    const hideOnClick = (e) => {
      if (e.target.closest('.popup-button.edit') || 
          e.target.closest('.cluster-edit-btn') ||
          e.target.closest('#preset-popup') ||
          e.target.classList.contains('preset-popup') ||
          e.target.closest('.sidebar-marker') ||
          e.target.closest('#sidebar')) {
        return;
      }
      
      if (this.popup && !this.popup.contains(e.target) && !e.target.closest('.leaflet-marker-icon')) {
        this.hide();
      }
    };
    const hideOnEscape = (e) => e.key === 'Escape' && this.hide();
    
    document.addEventListener('click', hideOnClick);
    document.addEventListener('keydown', hideOnEscape);
  }

  // filters marker entries based on which categories are currently visible
  filterVisibleEntries(entries) {
    if (!entries || !Array.isArray(entries)) return [];
    
    return entries.filter(categoryGroup => {
      if (!window.categoryState) return true;
      const category = categoryGroup.category || "Unknown";
      const catState = window.categoryState[category];
      return !catState || (categoryGroup.subcategory ? catState.subcategories?.[categoryGroup.subcategory] : catState.enabled);
    });
  }

  // displays the popup for a marker at the given screen position
  async show(marker, position) {
    if (!this.isValidMarker(marker)) return;
    
    if (!this.initialized) {
      this.initPromise.then(async () => {
        if (this.initialized) {
          await this.show(marker, position);
        }
      }).catch(error => {
        console.error('Failed to show popup after initialization:', error);
      });
      return;
    }
    
    this.currentMarker = marker;
    this.lastPosition = position;
    
    const renderResult = await this.render();
    if (!renderResult) return this.hide();
    
    window.ItemMarking?.syncCheckboxStates(this.popup, marker);
    
    this.position(position);
    this.animateIn();
    
    if (window.PopupPinning) {
      window.PopupPinning.makePopupDraggable(this.popup, marker);
    }
  }

  // checks if a marker has items to show in the popup
  isValidMarker(marker) {
    return marker.isCluster ? marker.clusterMarkers?.length : marker.entries?.length;
  }

  // animates the popup appearing on screen
  animateIn() {
    this.popup.classList.remove('hidden');
    this.popup.classList.add('animating-in');
    requestAnimationFrame(() => {
      this.popup.classList.remove('animating-in');
      this.popup.classList.add('visible');
    });
  }

  // hides the popup with a fade out animation
  hide() {
    if (this.popup.classList.contains('hidden')) return;
    this.popup.classList.remove('visible');
    this.popup.classList.add('animating-out');
    setTimeout(() => {
      this.popup.classList.remove('animating-out');
      this.popup.classList.add('hidden');
    }, 200);
  }

  // positions the popup on screen avoiding the sidebar and top bar
  position(pos) {
    Object.assign(this.popup.style, { left: '0px', top: '0px', visibility: 'hidden' });
    this.popup.classList.remove('hidden');
    
    const rect = this.popup.getBoundingClientRect();
    const margin = 10;
    
    const sidebarWidth = 340;
    const topbarHeight = 60;
    
    const minLeft = sidebarWidth + margin;
    const minTop = topbarHeight + margin;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    
    let left = Math.max(minLeft, Math.min(pos.x - rect.width / 2, maxLeft));
    
    let top = pos.y - rect.height - 20;
    if (top < minTop) {
      top = pos.y + 20;
    }
    if (top > maxTop) {
      top = maxTop;
    }
    
    Object.assign(this.popup.style, { left: `${left}px`, top: `${top}px`, visibility: 'visible' });
  }

  // renders the popup content based on whether it's a cluster or regular marker
  async render() {
    if (!this.popup) {
      console.error('Popup element not created');
      return false;
    }
    
    if (!this.templates.main) {
      console.error('Main template not loaded');
      return false;
    }
    
    this.popup.innerHTML = this.templates.main;
    return this.currentMarker.isCluster ? await this.renderCluster() : await this.renderRegular();
  }

  // renders popup content for a single marker location
  async renderRegular() {
    const categoryGroups = this.filterVisibleEntries(this.currentMarker.entries);
    if (!categoryGroups.length) return false;
    
    const totalItems = categoryGroups.reduce((count, group) => count + (group.items?.length || 0), 0);
    
    const title = this.currentMarker.name || 
      (totalItems > 1 ? `Location (${totalItems} items)` : this.getFirstItemName(categoryGroups));
    this.popup.querySelector('.popup-title').textContent = title;
    
    const contentDiv = this.popup.querySelector('.popup-content');
    let itemIndex = 0;
    const itemsHTML = [];
    
    for (const categoryGroup of categoryGroups) {
      if (categoryGroup.items && Array.isArray(categoryGroup.items)) {
        for (const item of categoryGroup.items) {
          const itemHTML = await this.createItemHTML(categoryGroup, item, itemIndex);
          itemsHTML.push(itemHTML);
          itemIndex++;
        }
      }
    }
    
    contentDiv.innerHTML = itemsHTML.join('');

    
    const editBtn = this.popup.querySelector('.popup-button.edit');
    if (editBtn) editBtn.style.display = 'block';
    
    this.setupEventHandlers();
    return true;
  }

  // renders popup content for clustered markers with multiple locations
  async renderCluster() {
    this.popup.querySelector('.popup-title').textContent = this.currentMarker.name;
    
    const clusterHTMLPromises = this.currentMarker.clusterMarkers.map((marker, i) => 
      this.createClusterHTML(marker, i)
    );
    
    const clusterHTMLResults = await Promise.all(clusterHTMLPromises);
    const clusterHTML = clusterHTMLResults.filter(html => html).join('');
    
    if (!clusterHTML.trim()) return false;
    
    this.popup.querySelector('.popup-content').innerHTML = clusterHTML;
    const editBtn = this.popup.querySelector('.popup-button.edit');
    if (editBtn) editBtn.style.display = 'none';
    this.setupEventHandlers();
    return true;
  }

  // creates HTML for one marker within a cluster popup
  async createClusterHTML(marker, index) {
    const categoryGroups = this.filterVisibleEntries(marker.entries || []);
    if (!categoryGroups.length) return '';
    
    let itemIndex = 0;
    const itemsHTML = [];
    
    for (const categoryGroup of categoryGroups) {
      if (categoryGroup.items && Array.isArray(categoryGroup.items)) {
        const subcatForImg = categoryGroup.subcategory || "";
        for (const item of categoryGroup.items) {
          let imageSrc;
          const fetchedImage = await fetchImageForItem(item.itemname, categoryGroup.category, subcatForImg);
          if (fetchedImage && (fetchedImage.startsWith('http://') || fetchedImage.startsWith('https://'))) {
            imageSrc = fetchedImage;
          } else {
            imageSrc = window.ImageLoader.getImageSrc(categoryGroup.category || 'Unknown', subcatForImg, `${item.itemname || 'Unknown'}.png`);
          }
          
          itemsHTML.push(
            window.TemplateUtils.fillTemplate(this.templates.clusterItem, {
              markerId: marker.id,
              entryIndex: itemIndex,
              imageSrc: imageSrc,
              name: item.itemname || 'Unknown Item',
              checked: item.marked === 1 ? 'checked' : '',
              checkedClass: item.marked === 1 ? 'checked' : ''
            })
          );
          itemIndex++;
        }
      }
    }
    
    return window.TemplateUtils.fillTemplate(this.templates.clusterMarker, {
      markerId: marker.id,
      markerName: marker.name || `Location ${index + 1}`,
      index: index,
      items: itemsHTML.join('')
    });
  }

  // creates HTML for a single item in the popup with image and checkbox
  async createItemHTML(categoryGroup, item, index) {
    const name = item.itemname || "Unknown Item";
    const category = categoryGroup.category || "Unknown";
    const subcategory = categoryGroup.subcategory || "";
    const clone = this.templates.item.content.cloneNode(true);
    const itemElement = clone.querySelector('.popup-item');

    itemElement.className = `popup-item ${item.marked === 1 ? 'checked' : ''}`;
    itemElement.dataset.index = index;

    const img = clone.querySelector('.item-img');
    
    let imageSrc;
    const fetchedImage = await fetchImageForItem(item.itemname, category, subcategory);
    if (fetchedImage && (fetchedImage.startsWith('http://') || fetchedImage.startsWith('https://'))) {
      imageSrc = fetchedImage;
    } else {
      imageSrc = window.ImageLoader.getImageSrc(category, subcategory, `${name}.png`);
    }
    
    Object.assign(img, {
      src: imageSrc,
      alt: name
    });

    clone.querySelector('.item-name').textContent = name;
    clone.querySelector('.item-category').textContent = 
      category + (subcategory ? ` / ${subcategory}` : '');

    const linkContainer = clone.querySelector('.item-link-container');
    linkContainer.innerHTML = '';
    linkContainer.dataset.category = category;
    linkContainer.dataset.subcategory = categoryGroup.subcategory || '';
    linkContainer.dataset.itemName = name;
    
    const checkbox = clone.querySelector('.item-check');
    checkbox.checked = item.marked === 1;
    if (item.marked === 1) checkbox.setAttribute('checked', 'checked');
    
    return itemElement.outerHTML;
  }

  // sets up click handlers for close button, edit buttons, and checkboxes
  setupEventHandlers() {
    this.popup.querySelector('.popup-close').onclick = () => this.hide();
    
    const editBtn = this.popup.querySelector('.popup-button.edit');
    if (editBtn && editBtn.style.display !== 'none') {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        window.universalEdit?.(this.currentMarker, this.popup);
      };
    }
    
    window.ItemMarking?.attachCheckboxHandlers(this.popup, this.currentMarker);
    
    this.popup.querySelectorAll('.cluster-edit-btn').forEach(btn => {
      const markerIndex = parseInt(btn.dataset.markerIndex);
      const clusterMarker = this.currentMarker.clusterMarkers?.[markerIndex];
      if (clusterMarker) {
        btn.onclick = (e) => {
          e.stopPropagation();
          window.universalEdit?.(clusterMarker, this.popup, this.currentMarker, markerIndex);
        };
      }
    });
  }

  // gets the name of the first item from category groups for the popup title
  getFirstItemName(categoryGroups) {
    for (const group of categoryGroups) {
      if (group.items && Array.isArray(group.items) && group.items.length > 0) {
        return group.items[0].itemname || "Unknown Item";
      }
    }
    return "Unknown Item";
  }

  // gets item name from an entry object for backwards compatibility
  getItemName(entry) {
    return entry.itemname || "Unknown Item";
  }
}

let markerPopupInstance = null;

// creates or returns the existing popup instance
function getMarkerPopupInstance() {
  if (!markerPopupInstance) {
    markerPopupInstance = new MarkerPopup();
  }
  return markerPopupInstance;
}

// opens popups for any marker type, handles both regular and pinned popups
async function openUniversalPopup(marker, leafletMap = null, options = {}) {
  const { position, pinned = false, popupData = null } = options;
  
  if (pinned) {
    const pinningInstance = window.PopupPinning?.getInstance?.();
    if (!pinningInstance) {
      console.error('PopupPinning not available for pinned popup');
      return;
    }
    
    if (popupData) {
      return pinningInstance.createRestoredPopup(marker, popupData);
    } else {
      const popup = getMarkerPopupInstance();
      const tempPosition = position || (leafletMap ? 
        leafletMap.latLngToContainerPoint([marker.y, marker.x]) : 
        { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      
      await popup.show(marker, tempPosition);
      return pinningInstance.pinPopup(popup.popup, marker);
    }
  }
  
  const popup = getMarkerPopupInstance();
  let displayPosition;
  
  if (position) {
    displayPosition = position;
  } else if (leafletMap && marker.x !== undefined && marker.y !== undefined) {
    const point = leafletMap.latLngToContainerPoint([marker.y, marker.x]);
    displayPosition = {
      x: point.x + leafletMap.getContainer().offsetLeft,
      y: point.y + leafletMap.getContainer().offsetTop
    };
  } else {
    displayPosition = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
  }
  
  await popup.show(marker, displayPosition);
}

// opens a popup for multiple markers clustered together
function openClusterPopup(cluster, markers, leafletMap) {
  const clusterPopup = {
    id: `cluster_${Date.now()}`,
    x: cluster[0].getLatLng().lng,
    y: cluster[0].getLatLng().lat,
    name: `Cluster (${markers.length} locations)`,
    isCluster: true,
    clusterMarkers: markers,
    entries: []
  };
  
  openUniversalPopup(clusterPopup, leafletMap);
}
// hides the currently displayed popup
function hideMarkerPopup() {
  if (markerPopupInstance) {
    markerPopupInstance.hide();
  }
}

window.openUniversalPopup = openUniversalPopup;
window.openClusterPopup = openClusterPopup;
window.getMarkerPopupInstance = getMarkerPopupInstance;