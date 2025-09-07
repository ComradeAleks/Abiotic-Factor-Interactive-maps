let categoryState = {};

window.categoryState = categoryState;

class Sidebar {
  // Creates a new sidebar instance and sets up the search functionality
  constructor() {
    this.setupSearch();
  }

  // Sets up the search input listener to filter categories and markers when user types
  setupSearch() {
    document.getElementById("category-search")?.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      this.filterCategories(query);
      this.filterMarkerList(query);
    });
  }

  // Fetches category data from the server and builds the sidebar category tree
  async init() {
    const data = await fetch("/api/categories").then(res => res.json());
    this.renderCategoryTree(data);
  }

  // Creates the category tree HTML elements and populates the sidebar
  renderCategoryTree(data) {
    const treeDiv = document.getElementById("category-tree");
    treeDiv.innerHTML = "";

    Object.entries(data).forEach(([category, subcategories]) => {
      if (!categoryState[category]) {
        categoryState[category] = { enabled: true, subcategories: {} };
        subcategories.forEach(sub => categoryState[category].subcategories[sub] = true);
      }

      const catDiv = this.createCategoryElement(category, subcategories, data);
      treeDiv.appendChild(catDiv);
    });
    
    window.categoryState = categoryState;
  }

  // Creates a single category element with its title and subcategories
  createCategoryElement(category, subcategories, data) {
    const catDiv = document.createElement("div");
    catDiv.className = "sidebar-category";
    catDiv.style.marginBottom = "8px";
    
    const titleClass = categoryState[category].enabled ? "" : "disabled";
    catDiv.innerHTML = `<span class="sidebar-cat-title ${titleClass}" style="font-weight:bold;font-size:17px;cursor:pointer;">${category}</span>`;

    if (subcategories.length) {
      const subcatDiv = this.createSubcategoriesElement(category, subcategories, data);
      catDiv.appendChild(subcatDiv);
    }

    catDiv.querySelector(".sidebar-cat-title").onclick = async () => {
      await this.toggleCategory(category, data);
    };

    return catDiv;
  }

  // Creates the subcategory elements container and individual subcategory buttons
  createSubcategoriesElement(category, subcategories, data) {
    const subcatDiv = document.createElement("div");
    Object.assign(subcatDiv, {
      className: "sidebar-subcategories",
      style: "display:flex;flex-wrap:wrap;gap:5px;margin-left:20px;margin-top:5px;align-items:flex-start;"
    });

    subcategories.forEach(subcat => {
      const subDiv = document.createElement("div");
      subDiv.className = "sidebar-subcategory";
      subDiv.style.display = "inline-block";
      subDiv.style.marginBottom = "2px";
      const titleClass = categoryState[category].subcategories[subcat] ? "" : "disabled";
      subDiv.innerHTML = `<span class="sidebar-subcat-title ${titleClass}" style="font-size:16px;cursor:pointer;white-space:nowrap;">${subcat}</span>`;
      subDiv.querySelector(".sidebar-subcat-title").onclick = async () => {
        await this.toggleSubcategory(category, subcat, data);
      };
      subcatDiv.appendChild(subDiv);
    });

    return subcatDiv;
  }

  // Toggles a category on/off and updates all its subcategories to match
  async toggleCategory(category, data) {
    categoryState[category].enabled = !categoryState[category].enabled;
    Object.keys(categoryState[category].subcategories).forEach(subcat => {
      categoryState[category].subcategories[subcat] = categoryState[category].enabled;
    });
    this.renderCategoryTree(data);
    await this.updateDisplay();
  }

  // Toggles a single subcategory and updates the parent category state accordingly
  async toggleSubcategory(category, subcat, data) {
    categoryState[category].subcategories[subcat] = !categoryState[category].subcategories[subcat];
    categoryState[category].enabled = Object.values(categoryState[category].subcategories).some(v => v);
    this.renderCategoryTree(data);
    await this.updateDisplay();
  }

  // Refreshes the marker list and map markers after category changes
  async updateDisplay() {
    if (typeof renderMarkerList === 'function') renderMarkerList();
    if (typeof refreshMapMarkers === 'function') await refreshMapMarkers();
  }

  // Hides/shows categories and subcategories based on search query text
  filterCategories(query) {
    document.querySelectorAll(".sidebar-category").forEach(catDiv => {
      const catTitle = catDiv.querySelector(".sidebar-cat-title").textContent.toLowerCase();
      const subcatDiv = catDiv.querySelector(".sidebar-subcategories");
      let showCat = catTitle.includes(query);
      let anySubVisible = false;

      if (subcatDiv) {
        subcatDiv.querySelectorAll(".sidebar-subcategory").forEach(subDiv => {
          const subTitle = subDiv.querySelector(".sidebar-subcat-title").textContent.toLowerCase();
          const match = subTitle.includes(query) || showCat;
          subDiv.style.display = match ? "block" : "none";
          if (match) anySubVisible = true;
        });
      }

      catDiv.style.display = (showCat || anySubVisible) ? "block" : "none";
    });
  }

  // Hides/shows markers in the marker list based on search query text
  filterMarkerList(query) {
    document.querySelectorAll(".sidebar-marker").forEach(markerDiv => {
      const markerText = markerDiv.querySelector(".sidebar-marker-text")?.textContent.toLowerCase() || "";
      const match = markerText.includes(query);
      markerDiv.style.display = match ? "block" : "none";
    });
  }

  // Builds and displays the list of markers that match current category filters
  renderMarkerList() {
    const listDiv = document.getElementById("marker-list");
    if (!listDiv || !markers || !currentMap) return;
    
    listDiv.innerHTML = "";
    
    markers
      .filter(m => m.map === currentMap && this.isMarkerVisible(m))
      .forEach(marker => {
        marker.entries.forEach(categoryGroup => {
          if (this.shouldShowEntry(categoryGroup) && categoryGroup.items) {
            categoryGroup.items.forEach(item => {
              const div = this.createMarkerListItem(item, marker);
              listDiv.appendChild(div);
            });
          }
        });
      });
  }

  // Checks if a marker should be visible based on current category filter settings
  isMarkerVisible(marker) {
    if (!categoryState) return true;
    return marker.entries.some(entry => this.shouldShowEntry(entry));
  }

  // Determines if a specific category entry should be shown based on filter state
  shouldShowEntry(entry) {
    if (!categoryState) return true;
    
    const category = entry.category || "Unknown";
    if (!categoryState[category]) return true;
    
    return entry.subcategory ? 
      categoryState[category].subcategories?.[entry.subcategory] :
      categoryState[category].enabled;
  }

  // Creates a clickable marker item element for the sidebar marker list
  createMarkerListItem(item, marker) {
    const div = document.createElement("div");
    const name = item.itemname || "Unknown";
    const isCompleted = item.marked === 1;
    div.className = `sidebar-marker${isCompleted ? ' marker-completed' : ''}`;
    div.innerHTML = `<span class="sidebar-marker-text">${name}</span>`;
    div.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = div.getBoundingClientRect();
      const position = {
        x: rect.right + 20,
        y: rect.bottom
      };
      requestAnimationFrame(() => {
        openUniversalPopup(marker, leafletMap, { position });
      });
    };
    
    return div;
  }
}

// Utility functions for updating sidebar from other parts of the app
const SidebarUtils = {
  // Triggers a marker list refresh if the function exists
  updateSidebar() {
    if (typeof renderMarkerList === 'function') {
      renderMarkerList();
    }
  },

  // Updates the marker list through the sidebar instance
  triggerMarkerListUpdate() {
    if (window.sidebar?.renderMarkerList) {
      window.sidebar.renderMarkerList();
    }
  }
};

// Initializes the sidebar when the page loads
document.addEventListener("DOMContentLoaded", async () => {
  window.sidebar = new Sidebar();
  if (window.sidebar) {
    try {
      await window.sidebar.init();
    } catch (error) {
      console.error("Failed to initialize sidebar:", error);
    }
  } else {
    setTimeout(async () => {
      if (window.sidebar) {
        await window.sidebar.init();
      }
    }, 100);
  }
});

// Global function to trigger marker list rendering from other scripts
function renderMarkerList() {
  window.sidebar?.renderMarkerList();
}

window.SidebarUtils = SidebarUtils;
