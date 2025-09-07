class InfoBoxDataViewManager {
  // Sets up the data view manager with empty cache and uninitialized state
  constructor() {
    this.initialized = false;
    this.itemCache = new Map();
  }

  // Waits for InfoBoxData to be ready then initializes the system
  async init() {
    if (this.initialized) return;
    
    if (!window.InfoBoxData) {
      await new Promise(resolve => {
        const check = () => {
          if (window.InfoBoxData) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }
    
    await window.InfoBoxData.init();
    this.initialized = true;
  }

  // Takes raw item data and processes it for display in templates
  processItemData(itemData) {
    if (!itemData) return {};

    const processed = {
      ...itemData,
      categoryDisplay: this.formatCategory(itemData.category, itemData.subcategory),
      wikiText: itemData.wiki ? '📖' : '',
      primaryImage: this.getItemImageSrc(itemData),
      secondaryImage: itemData.additionalImage || '',
      secondaryImageDisplay: itemData.additionalImage ? 'display: block;' : 'display: none;',
      addButtonDisplay: itemData.additionalImage ? 'display: none;' : 'display: block;'
    };

    // Handle description field with custom description priority
    processed.description = itemData.customDescription || itemData.description || 'No description available.';
    
    // Handle notes field
    processed.notes = itemData.notes || '';

    // Handle location field with custom location priority
    if (itemData.customLocation) {
      processed.location = itemData.customLocation;
    } else {
      const locationData = itemData['Appears in'] || itemData.location;
      if (Array.isArray(locationData) && locationData.length > 0) {
        processed.location = this.processDataField(locationData, 'locations');
      } else if (typeof locationData === 'string' && locationData !== 'Unknown') {
        processed.location = locationData;
      } else {
        processed.location = itemData.location || 'Unknown';
      }
    }

    processed.drops = this.processDataField(itemData.Drops || itemData.drops, 'drops');
    processed.dropsDisplay = this.getFieldDisplay(processed.drops);

    processed.harvestableDrops = this.processDataField(itemData['Harvestable Drops'] || itemData.harvestableDrops, 'harvestable');
    processed.harvestableDisplay = this.getFieldDisplay(processed.harvestableDrops);

    processed.trades = this.processDataField(itemData.Trade || itemData.trades, 'trades');
    processed.tradesDisplay = this.getFieldDisplay(processed.trades);

    processed.butchering = this.processDataField(itemData.Butchering, 'butchering');
    processed.butcheringDisplay = this.getFieldDisplay(processed.butchering);

    processed.scrapResult = this.processDataField(itemData['Scrap Result'], 'scrap');
    processed.scrapDisplay = this.getFieldDisplay(processed.scrapResult);

    processed.recipe = this.processDataField(itemData.Recipe, 'recipe', itemData.name);
    processed.recipeDisplay = this.getFieldDisplay(processed.recipe);

    processed.farming = this.processDataField(itemData.Farming, 'farming');
    processed.farmingDisplay = this.getFieldDisplay(processed.farming);

    processed.appearsIn = this.processDataField(itemData['Appears in'], 'locations');
    processed.appearsInDisplay = this.getFieldDisplay(processed.appearsIn);

    return processed;
  }

  // Formats different types of data fields based on the field type and content
  processDataField(fieldData, fieldType, itemName = '') {
    if (!fieldData || fieldData === false || fieldData === 'false') {
      return '';
    }

    if (Array.isArray(fieldData)) {
      if (fieldData.length === 0) return '';
      
      switch (fieldType) {
        case 'trades':
          return this.formatTrades(fieldData);
        case 'recipe':
          return this.formatRecipe(fieldData, itemName);
        case 'drops':
        case 'harvestable':
        case 'butchering':
          if (fieldData.length > 0 && Array.isArray(fieldData[0])) {
            return this.formatStructuredDropList(fieldData, fieldType);
          } else {
            return this.formatItemList(fieldData, fieldType);
          }
        case 'locations':
          return this.formatLocationList(fieldData);
        case 'scrap':
        case 'farming':
          return this.formatSimpleItemList(fieldData, fieldType);
        default:
          return this.formatItemList(fieldData, fieldType);
      }
    }

    if (typeof fieldData === 'string') {
      switch (fieldType) {
        case 'recipe':
          return this.formatRecipe(fieldData, itemName);
        default:
          return this.formatItemReference(fieldData, fieldType);
      }
    }

    if (typeof fieldData === 'object') {
      return this.formatObjectData(fieldData, fieldType);
    }

    return String(fieldData);
  }

  // Formats drop lists that have structured data like amounts and percentages
  formatStructuredDropList(dropList, type) {
    if (!dropList || dropList.length === 0) return '';

    return dropList.map(dropData => {
      if (!Array.isArray(dropData) || dropData.length < 3) {
        return this.createItemElement(dropData, type);
      }

      const [amount, itemName, percentage] = dropData;
      const itemElement = this.createItemElement(itemName, type);
      
      const percentageDisplay = percentage ? percentage.replace(/\n/g, '<br>') : '';
      
      return `<div class="drop-entry ${type}-drop">
        ${itemElement}
        <div class="drop-details">
          <span class="drop-amount">${amount || ''}</span>
          <span class="drop-chance">${percentageDisplay}</span>
        </div>
      </div>`;
    }).join('');
  }

  // Formats trade data showing what you give and what you get
  formatTrades(trades) {
    if (!trades || trades.length === 0) return '';

    return trades.map(trade => {
      if (Array.isArray(trade) && trade.length >= 2) {
        const giveItem = this.createItemElement(trade[1], 'trade-give');
        const getItem = this.createItemElement(trade[0], 'trade-get');
        return `<div class="trade-pair">${giveItem} → ${getItem}</div>`;
      }
      return `<div class="trade-item">${this.createItemElement(trade, 'trade')}</div>`;
    }).join('');
  }

  // Creates HTML for lists of items, handling special drop data if present
  formatItemList(items, type) {
    if (!items || items.length === 0) return '';

    return items.map(item => {
      if (Array.isArray(item) && item.length >= 3) {
        return this.formatDropEntry(item, type);
      }
      return `<div class="item-list-entry ${type}-item">${this.createItemElement(item, type)}</div>`;
    }).join('');
  }

  // Formats a single drop entry with item name, amount and drop chance
  formatDropEntry(dropData, type) {
    const [itemName, amount, chance] = dropData;
    const itemElement = this.createItemElement(itemName, type);
    
    return `<div class="drop-entry ${type}-drop">
      ${itemElement}
      <div class="drop-details">
        <span class="drop-amount">${amount}</span>
        <span class="drop-chance">${chance}</span>
      </div>
    </div>`;
  }

  // Formats location names as clickable tags
  formatLocationList(locations) {
    if (!locations || locations.length === 0) return '';

    return locations.map(location => {
      return `<span class="location-tag">${location}</span>`;
    }).join(' ');
  }

  // Formats recipe data into readable ingredient lists and instructions
  formatRecipe(recipeData, itemName = '') {
    if (!recipeData) return '';

    if (Array.isArray(recipeData)) {
      const recipes = recipeData.map(recipeArray => {
        if (Array.isArray(recipeArray) && recipeArray.length === 2 && 
            Array.isArray(recipeArray[0]) && Array.isArray(recipeArray[1])) {
          const ingredients = recipeArray[0];
          return this.formatRecipeFromArrays(ingredients, itemName);
        } else {
          const recipeString = Array.isArray(recipeArray) ? recipeArray[0] : recipeArray;
          return this.formatSingleRecipe(recipeString, itemName);
        }
      });
      return recipes.join('<div class="recipe-separator"></div>');
    }

    if (typeof recipeData === 'string') {
      const recipes = this.splitMultipleRecipes(recipeData);
      return recipes.map(recipe => this.formatSingleRecipe(recipe, itemName)).join('<div class="recipe-separator"></div>');
    }

    return '';
  }

  // Creates recipe display from ingredient arrays
  formatRecipeFromArrays(ingredients, itemName = '') {
    const ingredientElements = ingredients.map(item => this.createItemElement(item, 'recipe-ingredient')).join('');

    return `<div class="recipe-container">
      <div class="recipe-header">
        <span class="recipe-title">Recipe for ${itemName}</span>
      </div>
      <div class="recipe-ingredients">
        <div class="recipe-items">${ingredientElements}</div>
      </div>
    </div>`;
  }

  // Splits complex recipe strings into separate recipes by parsing brackets and separators
  splitMultipleRecipes(recipeString) {
    const patterns = /\]\s*=\s*\[/g;
    
    const recipes = [];
    let currentRecipe = '';
    let bracketDepth = 0;
    let inResult = false;
    
    for (let i = 0; i < recipeString.length; i++) {
      const char = recipeString[i];
      const nextChar = recipeString[i + 1];
      const prevChar = recipeString[i - 1];
      
      currentRecipe += char;
      
      if (char === '[') {
        bracketDepth++;
      } else if (char === ']') {
        bracketDepth--;
        
        if (bracketDepth === 0 && inResult) {
          let ahead = i + 1;
          while (ahead < recipeString.length && /\s/.test(recipeString[ahead])) ahead++;
          
          if (ahead < recipeString.length && recipeString[ahead] === ',') {
            let furtherAhead = ahead + 1;
            while (furtherAhead < recipeString.length && /\s/.test(recipeString[furtherAhead])) furtherAhead++;
            
            if (furtherAhead < recipeString.length && 
                (recipeString[furtherAhead] === '[' || /[A-Z]/.test(recipeString[furtherAhead]))) {
              recipes.push(currentRecipe.trim());
              currentRecipe = '';
              inResult = false;
              i = ahead;
              continue;
            }
          }
        }
      } else if (char === '=' && bracketDepth === 0) {
        inResult = true;
      }
    }
    
    if (currentRecipe.trim()) {
      recipes.push(currentRecipe.trim());
    }
    
    if (recipes.length <= 1) {
      const simpleSplit = recipeString.split(/\]\s*=\s*\[.*?\]\s*,\s*(?=\[)/);
      if (simpleSplit.length > 1) {
        return simpleSplit.map((recipe, index) => {
          if (index < simpleSplit.length - 1) {
            const nextPart = recipeString.substring(
              recipeString.indexOf(recipe) + recipe.length
            );
            const resultMatch = nextPart.match(/\]\s*=\s*\[.*?\]/);
            if (resultMatch) {
              return recipe + resultMatch[0];
            }
          }
          return recipe;
        }).filter(r => r.trim());
      }
    }
    
    return recipes.length > 0 ? recipes : [recipeString];
  }

  // Formats a single recipe string by splitting ingredients from results
  formatSingleRecipe(recipeString, itemName = '') {
    const recipeParts = recipeString.split('=');
    if (recipeParts.length !== 2) return recipeString;

    const ingredientsStr = recipeParts[0].trim().replace(/^\[|\]$/g, '');
    const ingredients = ingredientsStr.split(',').map(item => item.trim()).filter(item => item);
    const ingredientElements = ingredients.map(item => this.createItemElement(item, 'recipe-ingredient')).join('');

    return `<div class="recipe-container">
      <div class="recipe-header">
        <span class="recipe-title">Recipe for ${itemName}</span>
      </div>
      <div class="recipe-ingredients">
        <div class="recipe-items">${ingredientElements}</div>
      </div>
    </div>`;
  }

  // Creates simple space-separated lists for basic item arrays
  formatSimpleItemList(items, type) {
    if (!items || items.length === 0) return '';

    return items.map(item => {
      return this.createItemElement(item, type);
    }).join(' ');
  }

  // Creates an item element for a single item name
  formatItemReference(itemName, type) {
    return this.createItemElement(itemName, type);
  }

  // Formats object data by showing key-value pairs
  formatObjectData(data, type) {
    const entries = Object.entries(data).map(([key, value]) => {
      if (Array.isArray(value)) {
        const formattedValue = this.formatItemList(value, type);
        return `<div class="object-field"><strong>${key}:</strong> ${formattedValue}</div>`;
      }
      return `<div class="object-field"><strong>${key}:</strong> ${value}</div>`;
    });
    return entries.join('');
  }

  // Creates a clickable item element with image and wiki link for display
  createItemElement(itemName, type) {
    if (!itemName || typeof itemName !== 'string') {
      return '<span class="unknown-item">Unknown Item</span>';
    }

    const cleanName = itemName.trim();
    const itemData = this.getItemDataForDisplay(cleanName);
    const imageSrc = itemData ? this.getItemImageSrc(itemData) : '/data/assets/Unknown.png';
    
    const wikiUrl = `https://abioticfactor.wiki.gg/wiki/${encodeURIComponent(cleanName.replace(/ /g, '_'))}`;
    
    return `<a href="${wikiUrl}" target="_blank" class="item-reference ${type}-reference" title="Click to view ${cleanName} on wiki">
      <img src="${imageSrc}" alt="${cleanName}" class="item-icon" onerror="this.src='/data/assets/Unknown.png'">
      <span class="item-name">${cleanName}</span>
    </a>`;
  }

  // Gets item data for displaying, using cache to avoid repeated lookups
  getItemDataForDisplay(itemName) {
    if (this.itemCache.has(itemName)) {
      return this.itemCache.get(itemName);
    }

    let itemData = null;
    
    if (window.InfoBoxData && window.InfoBoxData.isReady()) {
      itemData = window.InfoBoxData.findPresetData(itemName);
    }

    this.itemCache.set(itemName, itemData);
    return itemData;
  }

  // Gets the best available image source for an item from its data
  getItemImageSrc(itemData) {
    if (!itemData) return '/data/assets/Unknown.png';

    if (itemData.image) {
      if (itemData.image.startsWith('http://') || itemData.image.startsWith('https://')) {
        return itemData.image;
      }
      
      if (window.ImageLoader) {
        return window.ImageLoader.getImageSrc(
          itemData.category || 'Unknown',
          itemData.subcategory || '',
          itemData.image
        );
      }
      
      return `/data/assets/${itemData.category || 'Unknown'}/${itemData.image}`;
    }

    return '/data/assets/Unknown.png';
  }

  // Formats category and subcategory into a readable display string
  formatCategory(category, subcategory) {
    if (!category) return 'Unknown';
    
    if (subcategory && subcategory !== '' && subcategory !== 'Unknown') {
      return `${category} - ${subcategory}`;
    }
    
    return category;
  }

  // Returns CSS display style based on whether content exists
  getFieldDisplay(content) {
    return content && content.trim() ? 'display: block;' : 'display: none;';
  }

  // Clears the item data cache to free memory
  clearCache() {
    this.itemCache.clear();
  }

  // Checks if the manager is fully initialized and ready to use
  isReady() {
    return this.initialized && window.InfoBoxData && window.InfoBoxData.isReady();
  }

  // Processes additional item fields like recipes, farming, and locations
  processExtendedFields(itemData) {
    const extended = {};

    const fieldMappings = {
      'Appears in': { key: 'appearsIn', type: 'locations' },
      'Butchering': { key: 'butchering', type: 'butchering' },
      'Scrap Result': { key: 'scrapResult', type: 'scrap' },
      'Recipe': { key: 'recipe', type: 'recipe' },
      'Farming': { key: 'farming', type: 'farming' }
    };

    Object.entries(fieldMappings).forEach(([originalKey, config]) => {
      const value = itemData[originalKey];
      if (value !== undefined && value !== false && value !== 'false') {
        extended[config.key] = this.processDataField(value, config.type);
        extended[config.key + 'Display'] = this.getFieldDisplay(extended[config.key]);
      } else {
        extended[config.key] = '';
        extended[config.key + 'Display'] = 'display: none;';
      }
    });

    return extended;
  }

  // Sets up click event handling for item references throughout the page
  setupEventDelegation() {
    document.addEventListener('click', (e) => {
      const itemRef = e.target.closest('.item-reference');
      if (itemRef && itemRef.dataset.itemName) {
        e.preventDefault();
        e.stopPropagation();
        this.handleItemReferenceClick(itemRef, e);
      }
    });
  }

  // Handles clicking on item references to show detailed information
  async handleItemReferenceClick(itemRef, event) {
    const itemName = itemRef.dataset.itemName;
    if (!itemName) return;

    if (window.ItemInformationBox && window.ItemInformationBox._instance) {
      const manager = window.ItemInformationBoxManager;
      if (manager) {
        await manager.showForMarkerItem({
          itemName: itemName,
          category: 'Unknown'
        }, event);
      } else {
        await window.ItemInformationBox._instance.showForItem(itemName, event);
      }
    }
  }
}

window.InfoBoxDataViewManager = new InfoBoxDataViewManager();

document.addEventListener('DOMContentLoaded', () => {
  if (window.InfoBoxDataViewManager) {
    window.InfoBoxDataViewManager.setupEventDelegation();
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfoBoxDataViewManager;
}
