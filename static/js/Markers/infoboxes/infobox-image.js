class InfoboxImages {
  // Simple check to verify the class is loaded and functional
  static isAvailable() {
    return true;
  }

  // Takes a file from the user and uploads it to the server, then adds it to the infobox
  static async uploadAndAddImage(infoboxInstance, file, replaceIndex = null) {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imageData = e.target.result;
          const itemKey = infoboxInstance.box.dataset.itemKey;
          
          if (itemKey && window.InfoBoxSaveLoad && window.currentMap) {
            try {
              const fileExtension = file.name.split('.').pop().toLowerCase();
              
              let mapPath = window.currentMap;
              console.log('DEBUG: Original window.currentMap:', mapPath);
              
              if (mapPath.includes('.')) {
                const parts = mapPath.split('/');
                parts.pop();
                mapPath = parts.join('/');
              }
              
              mapPath = mapPath.replace(/\\/g, '/');
              console.log('DEBUG: Final mapPath for upload:', mapPath);
              
              const response = await fetch(`/api/upload-image?map=${encodeURIComponent(mapPath)}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  imageData: imageData,
                  fileExtension: fileExtension
                })
              });
              
              const result = await response.json();
              
              if (result.success) {
                const normalizedMapPath = mapPath.replace(/\\/g, '/');
                const imageUrl = `/api/map-images/${normalizedMapPath}/${result.imagePath}`;
                
                const actualItemName = infoboxInstance.getItemNameFromBox();
                
                let itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, actualItemName);
                if (itemData) {
                  let images = [];
                  if (itemData.additionalImage) {
                    images = itemData.additionalImage.split(',').map(url => url.trim()).filter(url => url);
                  }
                  
                  if (replaceIndex !== null && replaceIndex < images.length) {
                    images[replaceIndex] = imageUrl;
                  } else {
                    images.push(imageUrl);
                  }
                  
                  itemData.additionalImage = images.join(',');
                  
                  window.InfoBoxSaveLoad.markerItemData.set(itemKey, itemData);
                  window.InfoBoxSaveLoad.saveMarkerItemData();
                  console.log('Image uploaded and saved successfully. URL:', imageUrl);
                  
                  InfoboxImages.refreshAdditionalImages(infoboxInstance);
                }
              } else {
                console.error('Failed to upload image:', result.error);
                alert('Failed to upload image. Please try again.');
              }
            } catch (error) {
              console.error('Error uploading image:', error);
              alert('Error uploading image. Please check your connection and try again.');
            }
          }
        } catch (error) {
          console.error('Error processing image upload:', error);
          alert('Error processing image. Please try again.');
        }
      };
      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        alert('Error reading file. Please try again.');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error in uploadAndAddImage:', error);
      alert('Error uploading image. Please try again.');
    }
  }

  // Grabs saved images for an item and displays them in the infobox container
  static refreshAdditionalImages(infoboxInstance) {
    if (!infoboxInstance || !infoboxInstance.box) {
      console.error('Invalid infobox instance provided to refreshAdditionalImages');
      return;
    }
    
    const container = infoboxInstance.box.querySelector('.additional-images-container');
    if (!container) {
      console.error('Additional images container not found in DOM');
      return;
    }
    
    const itemKey = infoboxInstance.box.dataset.itemKey;
    if (!itemKey) {
      console.error('No item key found on infobox');
      return;
    }
    
    if (!window.InfoBoxSaveLoad) {
      console.error('InfoBoxSaveLoad not available');
      return;
    }
    
    if (!window.InfoBoxSaveLoad.isReady()) {
      console.log('InfoBoxSaveLoad not ready, retrying in 200ms...');
      setTimeout(() => InfoboxImages.refreshAdditionalImages(infoboxInstance), 200);
      return;
    }
    
    console.log('Checking for saved data with key:', itemKey);
    
    let itemData = null;
    if (window.InfoBoxSaveLoad.hasItemData(itemKey)) {
      itemData = window.InfoBoxSaveLoad.getItemData(itemKey);
      console.log('Found saved item data:', itemData);
    } else {
      console.log('No saved item data found for key:', itemKey);
      if (window.InfoBoxSaveLoad.markerItemData) {
        const allKeys = Array.from(window.InfoBoxSaveLoad.markerItemData.keys());
        console.log('Available saved keys:', allKeys);
      }
      return;
    }
    
    let images = [];
    if (itemData && itemData.additionalImage) {
      images = itemData.additionalImage.split(',').map(url => url.trim()).filter(url => url);
      console.log('Parsed additional images:', images);
    } else {
      console.log('No additionalImage field found or it is empty');
    }
    
    container.innerHTML = '';
    
    if (images.length === 0) {
      console.log('No additional images to display');
      return;
    }
    
    images.forEach((imageUrl, index) => {
      console.log(`Adding image ${index + 1}:`, imageUrl);
      const imageItem = document.createElement('div');
      imageItem.className = 'additional-image-item';
      imageItem.innerHTML = `
        <img src="${imageUrl}" alt="Additional image ${index + 1}" class="additional-image" onclick="InfoboxImages.showImageZoom(this)">
        <div class="additional-image-controls">
          <button class="image-control-btn replace-btn" title="Replace image" onclick="InfoboxImages.replaceImage(${index}, '${itemKey}')">↻</button>
          <button class="image-control-btn remove-btn" title="Remove image" onclick="InfoboxImages.removeImage(${index}, '${itemKey}')">×</button>
        </div>
      `;
      container.appendChild(imageItem);
    });
    
    console.log(`Successfully added ${images.length} additional images to container`);
  }

  // Opens up a full-screen zoom modal when someone clicks on an image
  static showImageZoom(imgElement) {
    let modal = document.getElementById('image-zoom-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'image-zoom-modal';
      modal.className = 'image-zoom-modal';
      modal.innerHTML = `
        <div class="image-zoom-container">
          <img id="zoom-image" src="" alt="Zoomed image">
          <button class="image-zoom-close" onclick="InfoboxImages.hideImageZoom()">×</button>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          InfoboxImages.hideImageZoom();
        }
      });
      
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
          InfoboxImages.hideImageZoom();
        }
      });
    }
    
    const zoomImg = modal.querySelector('#zoom-image');
    zoomImg.src = imgElement.src;
    zoomImg.alt = imgElement.alt;
    modal.classList.add('active');
  }

  // Closes the image zoom modal
  static hideImageZoom() {
    const modal = document.getElementById('image-zoom-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // Deletes an image from both the server and the saved data, then refreshes the display
  static async removeImage(index, itemKey) {
    if (!window.InfoBoxSaveLoad) return;
    
    const itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, '');
    if (itemData && itemData.additionalImage) {
      let images = itemData.additionalImage.split(',').map(url => url.trim()).filter(url => url);
      
      if (index >= 0 && index < images.length) {
        const imageUrl = images[index];
        
        try {
          let mapPath = window.currentMap;
          if (mapPath.includes('.')) {
            const parts = mapPath.split('/');
            parts.pop();
            mapPath = parts.join('/');
          }
          
          mapPath = mapPath.replace(/\\/g, '/');
          
          const response = await fetch(`/api/delete-image?map=${encodeURIComponent(mapPath)}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imagePath: imageUrl
            })
          });
          
          const result = await response.json();
          if (!result.success) {
            console.warn('Failed to delete image file from server:', result.error);
          } else {
            console.log('Successfully deleted image file from server');
          }
        } catch (error) {
          console.warn('Error deleting image file from server:', error);
        }
        
        images.splice(index, 1);
        
        itemData.additionalImage = images.length > 0 ? images.join(',') : '';
        
        window.InfoBoxSaveLoad.markerItemData.set(itemKey, itemData);
        window.InfoBoxSaveLoad.saveMarkerItemData();
        
        const infoBox = document.querySelector(`[data-item-key="${itemKey}"]`);
        if (infoBox) {
          const instance = window.InfoBoxSaveLoad.getInstanceForBox(infoBox);
          if (instance) {
            InfoboxImages.refreshAdditionalImages(instance);
          }
        }
      }
    }
  }

  // Lets the user pick a new image to replace an existing one
  static replaceImage(index, itemKey) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        let oldImageUrl = null;
        const itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, '');
        if (itemData && itemData.additionalImage) {
          const images = itemData.additionalImage.split(',').map(url => url.trim()).filter(url => url);
          if (index >= 0 && index < images.length) {
            oldImageUrl = images[index];
          }
        }
        
        const infoBox = document.querySelector(`[data-item-key="${itemKey}"]`);
        if (infoBox) {
          const instance = window.InfoBoxSaveLoad.getInstanceForBox(infoBox);
          if (instance) {
            await InfoboxImages.uploadAndAddImage(instance, file, index);
            
            if (oldImageUrl) {
              try {
                let mapPath = window.currentMap;
                if (mapPath.includes('.')) {
                  const parts = mapPath.split('/');
                  parts.pop();
                  mapPath = parts.join('/');
                }
                
                mapPath = mapPath.replace(/\\/g, '/');
                
                const response = await fetch(`/api/delete-image?map=${encodeURIComponent(mapPath)}`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    imagePath: oldImageUrl
                  })
                });
                
                const result = await response.json();
                if (result.success) {
                  console.log('Successfully deleted old image file from server');
                } else {
                  console.warn('Failed to delete old image file from server:', result.error);
                }
              } catch (error) {
                console.warn('Error deleting old image file from server:', error);
              }
            }
          }
        }
      }
    });
    
    input.click();
  }

  // Clears broken image data when an image fails to load
  static handleImageLoadError(imgElement) {
    const infoBox = imgElement.closest('.item-info-box');
    if (infoBox && infoBox.dataset.itemKey) {
      const itemKey = infoBox.dataset.itemKey;
      
      if (window.InfoBoxSaveLoad && window.InfoBoxSaveLoad.isReady()) {
        let itemData = window.InfoBoxSaveLoad.getOrCreateItemData(itemKey, '');
        if (itemData) {
          itemData.additionalImage = '';
          window.InfoBoxSaveLoad.markerItemData.set(itemKey, itemData);
          window.InfoBoxSaveLoad.saveMarkerItemData();
          console.log('Cleared failed image for item:', itemKey);
        }
      }
    }
  }
}

// Make InfoboxImages globally available with error handling
try {
  window.InfoboxImages = InfoboxImages;
  console.log('InfoboxImages successfully loaded and made available globally');
} catch (error) {
  console.error('Failed to make InfoboxImages globally available:', error);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InfoboxImages;
}
