class InfoBoxData {
  // sets up the system for managing item data and presets
  constructor() {
    this.presetData = new Map();
    this.initialized = false;
  }

  // loads all the preset data from the server once at startup
  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadPresetData();
      this.initialized = true;
      console.log('InfoBoxData initialized successfully');
    } catch (error) {
      console.error('Failed to initialize InfoBoxData:', error);
    }
  }

  // fetches item preset data from the API and processes it into a searchable format
  async loadPresetData() {
    try {
      const response = await fetch('/api/presets');
      if (!response.ok) {
        console.warn('Could not load presets from API');
        return;
      }
      
      const presetData = await response.json();
      let totalItemsLoaded = 0;
      
      for (const [category, items] of Object.entries(presetData)) {
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.item) {
              const itemName = item.item.toLowerCase().trim();
              
              let location = 'Unknown';
              if (item['Appears in'] && Array.isArray(item['Appears in']) && item['Appears in'].length > 0) {
                location = item['Appears in'];
              } else if (item['Appears in'] && typeof item['Appears in'] === 'string') {
                location = [item['Appears in']];
              }
              
              this.presetData.set(itemName, {
                name: item.item,
                category: category,
                subcategory: item.subcategory || '',
                wiki: item.link || '',
                location: location,
                type: item.Type || 'Unknown',
                drops: item.Drops || [],
                Drops: item.Drops || [],
                harvestableDrops: item['Harvestable Drops'] || [],
                'Harvestable Drops': item['Harvestable Drops'] || [],
                trades: item.Trade || [],
                Trade: item.Trade || [],
                Butchering: item.Butchering || [],
                Recipe: item.Recipe || '',
                'Scrap Result': item['Scrap Result'] || [],
                Farming: item.Farming || [],
                description: item.description || '',
                image: item.image || '',
                additionalImage: ''
              });
              totalItemsLoaded++;
            }
          });
        }
      }
      
      console.log(`Loaded ${totalItemsLoaded} preset items from ${Object.keys(presetData).length} categories`);
      let count = 0;
      for (const [key, data] of this.presetData) {
        if (count < 3) {
          console.log(`Preset item example: "${key}" ->`, data.name);
          count++;
        } else break;
      }
    } catch (error) {
      console.error('Failed to load preset data:', error);
    }
  }

  // creates a unique key for storing custom item data by combining marker ID and item name
  createItemKey(markerId, itemName) {
    const sanitizedName = itemName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    return `${markerId}_${sanitizedName}`;
  }

  // searches for preset data using various matching strategies to handle different item name formats
  findPresetData(itemName) {
    const searchName = itemName.toLowerCase().trim();
    
    let presetData = this.presetData.get(searchName);
    if (presetData) return presetData;
    
    const cleanName = searchName.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    presetData = this.presetData.get(cleanName);
    if (presetData) return presetData;
    
    const noVersionName = searchName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    presetData = this.presetData.get(noVersionName);
    if (presetData) return presetData;
    
    for (const [key, data] of this.presetData) {
      if (key.includes(searchName) || searchName.includes(key)) {
        return data;
      }
    }

    return null;
  }

  // creates a basic data structure for items that don't have preset information
  createBasicItemData(itemName) {
    return {
      name: itemName,
      category: 'Unknown',
      subcategory: '',
      wiki: '',
      location: 'Unknown',
      'Appears in': [],
      drops: [],
      Drops: [],
      harvestableDrops: [],
      'Harvestable Drops': [],
      trades: [],
      Trade: [],
      Butchering: [],
      Recipe: '',
      'Scrap Result': [],
      Farming: [],
      description: 'No detailed information available.',
      image: '',
      additionalImage: '',
      infoboxWidth: null,
      infoboxHeight: null
    };
  }

  // combines preset data with custom user data to create complete item information
  getEnhancedItemData(itemName, customData = {}) {
    let presetData = this.findPresetData(itemName);
    
    if (!presetData) {
      presetData = this.createBasicItemData(itemName);
    }

    return {
      ...presetData,
      customDescription: customData.customDescription || '',
      customLocation: customData.customLocation || '',
      additionalImage: customData.additionalImage || '',
      notes: customData.notes || '',
      infoboxWidth: customData.infoboxWidth || null,
      infoboxHeight: customData.infoboxHeight || null
    };
  }

  // gets the appropriate image URL for an item, falling back to unknown image if needed
  getItemImage(itemData) {
    if (itemData.image) {
      return itemData.image;
    }
    
    return '/data/assets/Unknown.png';
  }

  // formats item data into a structure ready for display in templates
  prepareTemplateData(itemData, itemKey) {
    if (window.InfoBoxDataViewManager && window.InfoBoxDataViewManager.isReady()) {
      return window.InfoBoxDataViewManager.processItemData(itemData);
    }
    
    const primaryImageSrc = this.getItemImage(itemData);
    
    const description = itemData.customDescription || itemData.description || 'No description available.';
    const location = itemData.customLocation || itemData.location || 'Unknown';
    
    return {
      name: itemData.name || 'Unknown Item',
      category: itemData.category || 'Unknown',
      subcategory: itemData.subcategory || '',
      wiki: itemData.wiki || itemData.link || '#',
      wikiText: (itemData.wiki || itemData.link) ? 'View on Wiki' : 'No Wiki Available',
      location: location,
      drops: Array.isArray(itemData.drops) ? itemData.drops.join(', ') : (itemData.drops || ''),
      harvestableDrops: Array.isArray(itemData.harvestableDrops) ? itemData.harvestableDrops.join(', ') : (itemData.harvestableDrops || ''),
      trades: Array.isArray(itemData.trades) ? itemData.trades.join(', ') : (itemData.trades || ''),
      description: description,
      notes: itemData.notes || '',
      primaryImage: primaryImageSrc,
      secondaryImage: itemData.additionalImage || '',
      categoryDisplay: itemData.subcategory ? `${itemData.category} / ${itemData.subcategory}` : (itemData.category || 'Unknown'),
      dropsDisplay: (Array.isArray(itemData.drops) ? itemData.drops.length > 0 : itemData.drops) ? 'display: block;' : 'display: none;',
      harvestableDisplay: (Array.isArray(itemData.harvestableDrops) ? itemData.harvestableDrops.length > 0 : itemData.harvestableDrops) ? 'display: block;' : 'display: none;',
      tradesDisplay: (Array.isArray(itemData.trades) ? itemData.trades.length > 0 : itemData.trades) ? 'display: block;' : 'display: none;',
      secondaryImageDisplay: itemData.additionalImage ? 'display: block;' : 'display: none;',
      addButtonDisplay: itemData.additionalImage ? 'display: none;' : 'display: block;',
      itemKey: itemKey
    };
    
    if (itemData.additionalImage) {
      console.log('Secondary image URL for', itemData.name, ':', itemData.additionalImage);
    }
  }

  // returns all preset data as a regular object for debugging or export
  getAllPresetData() {
    return Object.fromEntries(this.presetData);
  }

  // checks if the data system is fully loaded and ready to use
  isReady() {
    return this.initialized && this.presetData.size > 0;
  }

  // returns how many preset items are currently loaded
  getPresetDataSize() {
    return this.presetData.size;
  }

  // searches through all preset data for items matching a text pattern
  searchPresetData(searchPattern) {
    const results = [];
    const pattern = searchPattern.toLowerCase();
    
    for (const [key, data] of this.presetData) {
      if (key.includes(pattern) || data.name.toLowerCase().includes(pattern)) {
        results.push(data);
      }
    }
    
    return results;
  }

  // gets a sorted list of all unique categories from the preset data
  getCategories() {
    const categories = new Set();
    for (const [key, data] of this.presetData) {
      categories.add(data.category);
    }
    return Array.from(categories).sort();
  }

  // returns all items that belong to a specific category, sorted alphabetically
  getItemsByCategory(category) {
    const items = [];
    for (const [key, data] of this.presetData) {
      if (data.category === category) {
        items.push(data);
      }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  // creates a description text by combining various item properties like drops and trades
  generateDescription(item) {
    let description = '';
    
    if (item.Type) {
      description += `This is a ${item.Type.toLowerCase()}. `;
    }
    
    if (item.Drops && item.Drops.length > 0) {
      description += `When defeated, it drops: ${item.Drops.join(', ')}. `;
    }
    
    if (item['Harvestable Drops'] && item['Harvestable Drops'].length > 0) {
      description += `Can be harvested for: ${item['Harvestable Drops'].join(', ')}. `;
    }
    
    if (item.Trades && item.Trades.length > 0) {
      description += `Available for trade: ${item.Trades.join(', ')}. `;
    }
    
    if (!description) {
      description = 'No additional information available.';
    }
    
    return description.trim();
  }
}

window.InfoBoxData = new InfoBoxData();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfoBoxData;
}
