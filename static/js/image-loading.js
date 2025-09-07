const ImageLoader = {
  // This function builds the correct file path for item images based on category and subcategory
  getImageSrc(category, subcategory, image, fallback = '/data/assets/Unknown.png') {
    if (image == "Unknown.png") return fallback;
    if (image.startsWith('http://') || image.startsWith('https://')) return image;
    
    const encodedCategory = encodeURIComponent(category);
    const encodedImage = encodeURIComponent(image);
    
    if (subcategory && subcategory !== "" && subcategory !== "Unknown") {
      const encodedSubcategory = encodeURIComponent(subcategory);
      return `/data/assets/${encodedCategory}/${encodedSubcategory}/${encodedImage}`;
    } else {
      return `/data/assets/${encodedCategory}/${encodedImage}`;
    }
  }
};

// This function fetches the image filename for an item by searching through preset files
async function fetchImageForItem(itemName, category, subcategory) {
  try {
    if (subcategory && subcategory !== "Unknown" && subcategory !== "") {
      const response = await fetch(`/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`);
      if (response.ok) {
        const items = await response.json();
        const item = items.find(item => item.item === itemName);
        if (item && item.image) {
          return item.image;
        }
      }
    }
    
    const response = await fetch(`/api/presets/${encodeURIComponent(category)}`);
    if (response.ok) {
      const items = await response.json();
      const item = items.find(item => item.item === itemName);
      if (item && item.image) {
        return item.image;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Error fetching image for item:', error);
    return null;
  }
}

window.ImageLoader = ImageLoader;
window.fetchImageForItem = fetchImageForItem;
