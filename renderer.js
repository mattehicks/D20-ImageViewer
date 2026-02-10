const { ipcRenderer } = require('electron');
const path = require('path');

let config = null;
let images = [];
let currentIndex = 0;

// DOM elements
const imageEl = document.getElementById('image');
const imageCounterEl = document.getElementById('image-counter');
const filenameEl = document.getElementById('filename');
const configPanel = document.getElementById('config-panel');
const noImageMsg = document.getElementById('no-image-msg');
const shortcutKeysEl = document.getElementById('shortcut-keys');
const shortcutsPanel = document.getElementById('shortcuts');
const quickFolderPanel = document.getElementById('quick-folder-panel');

// Initialize
async function init() {
    config = await ipcRenderer.invoke('load-config');
    if (config) {
        await loadImages();
        updateShortcutDisplay();
    }
}

async function loadImages() {
    if (!config || !config.sourceFolder) {
        showNoImages();
        return;
    }

    images = await ipcRenderer.invoke('load-images', config.sourceFolder);
    
    if (images.length > 0) {
        currentIndex = 0;
        displayImage();
        hideNoImages();
    } else {
        showNoImages();
    }
}

function displayImage() {
    if (images.length === 0) {
        showNoImages();
        return;
    }

    const imagePath = images[currentIndex];
    imageEl.src = imagePath;
    imageCounterEl.textContent = `${currentIndex + 1} / ${images.length}`;
    filenameEl.textContent = path.basename(imagePath);
    hideNoImages();
}

function showNoImages() {
    imageEl.style.display = 'none';
    noImageMsg.style.display = 'block';
    imageCounterEl.textContent = '0 / 0';
    filenameEl.textContent = 'No images';
}

function hideNoImages() {
    imageEl.style.display = 'block';
    noImageMsg.style.display = 'none';
}

function nextImage() {
    if (images.length === 0) return;
    currentIndex = (currentIndex + 1) % images.length;
    displayImage();
}

function previousImage() {
    if (images.length === 0) return;
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    displayImage();
}

async function moveToFolder(destKey) {
    if (images.length === 0) return;
    
    const destination = config.destinationFolders[destKey];
    if (!destination) return;

    const currentImage = images[currentIndex];
    const result = await ipcRenderer.invoke('move-file', currentImage, destination.path);
    
    if (result.success) {
        showStatus(`Moved to ${destination.name}`);
        
        // Remove from current list
        images.splice(currentIndex, 1);
        
        // Adjust index
        if (images.length === 0) {
            showNoImages();
        } else {
            if (currentIndex >= images.length) {
                currentIndex = images.length - 1;
            }
            displayImage();
        }
    } else {
        showStatus(`Error: ${result.error}`, true);
    }
}

async function deleteCurrentImage() {
    if (images.length === 0) return;
    
    const currentImage = images[currentIndex];
    const result = await ipcRenderer.invoke('delete-file', currentImage);
    
    if (result.success) {
        showStatus('Deleted (moved to recycle bin)');
        
        // Remove from current list
        images.splice(currentIndex, 1);
        
        // Adjust index
        if (images.length === 0) {
            showNoImages();
        } else {
            if (currentIndex >= images.length) {
                currentIndex = images.length - 1;
            }
            displayImage();
        }
    } else {
        showStatus(`Error: ${result.error}`, true);
    }
}

function showStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.background = isError ? 'rgba(156, 14, 14, 0.95)' : 'rgba(14, 99, 156, 0.95)';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 2000);
}

function updateShortcutDisplay() {
    if (!config || !config.destinationFolders) return;
    
    shortcutKeysEl.innerHTML = '';
    
    Object.entries(config.destinationFolders).forEach(([key, folder]) => {
        const shortcutDiv = document.createElement('div');
        shortcutDiv.className = 'shortcut';
        shortcutDiv.innerHTML = `
            <span class="key">${folder.key}</span>
            <span class="label">→ ${folder.name}</span>
        `;
        shortcutKeysEl.appendChild(shortcutDiv);
    });
}

// Keyboard handlers
document.addEventListener('keydown', (e) => {
    // Don't handle keys if config panel is open
    if (configPanel.classList.contains('active')) return;

    if (e.key === 'ArrowRight') {
        nextImage();
    } else if (e.key === 'ArrowLeft') {
        previousImage();
    } else if (e.key === 'x' || e.key === 'X') {
        deleteCurrentImage();
    } else if (config && config.destinationFolders) {
        // Check for destination folder keys
        Object.entries(config.destinationFolders).forEach(([key, folder]) => {
            if (e.key === folder.key) {
                moveToFolder(key);
            }
        });
    }
});

// Open folder handler
document.getElementById('open-folder-btn').addEventListener('click', async () => {
    const folder = await ipcRenderer.invoke('select-folder');
    if (folder) {
        config.sourceFolder = folder;
        await ipcRenderer.invoke('save-config', config);
        await loadImages();
        showStatus('Source folder updated');
    }
});

document.getElementById('cancel-config').addEventListener('click', () => {
    configPanel.classList.remove('active');
});

document.getElementById('save-config').addEventListener('click', async () => {
    await saveConfig();
    configPanel.classList.remove('active');
    await loadImages();
    updateShortcutDisplay();
});

document.getElementById('reload-btn').addEventListener('click', async () => {
    await loadImages();
    showStatus('Images reloaded');
});

document.getElementById('shortcuts-close').addEventListener('click', () => {
    shortcutsPanel.classList.add('hidden');
});

document.getElementById('toggle-shortcuts-btn').addEventListener('click', () => {
    shortcutsPanel.classList.toggle('hidden');
});

document.getElementById('quick-folder-btn').addEventListener('click', () => {
    updateQuickFolderPanel();
    quickFolderPanel.classList.add('active');
});

document.getElementById('qf-close').addEventListener('click', () => {
    quickFolderPanel.classList.remove('active');
});

document.querySelectorAll('.qf-select').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const key = e.target.dataset.key;
        const folder = await ipcRenderer.invoke('select-folder');
        if (folder) {
            const folderName = folder.split('\\').pop() || folder.split('/').pop();
            config.destinationFolders[key].path = folder;
            config.destinationFolders[key].name = folderName;
            await ipcRenderer.invoke('save-config', config);
            updateQuickFolderPanel();
            updateShortcutDisplay();
        }
    });
});

function updateQuickFolderPanel() {
    if (!config || !config.destinationFolders) return;
    
    Object.entries(config.destinationFolders).forEach(([key, folder]) => {
        const nameEl = document.getElementById(`qf-name-${key}`);
        if (nameEl) {
            nameEl.textContent = folder.name || 'Not set';
        }
    });
}

function openConfigPanel() {
    if (!config) return;
    
    // Populate source folder
    document.getElementById('source-folder').value = config.sourceFolder || '';
    
    // Populate destination folders
    const destContainer = document.getElementById('destination-folders');
    destContainer.innerHTML = '';
    
    Object.entries(config.destinationFolders).forEach(([key, folder]) => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-config';
        folderDiv.innerHTML = `
            <div class="config-group">
                <label>Keyboard Shortcut:</label>
                <input type="text" class="dest-key" data-key="${key}" value="${folder.key}" maxlength="1">
            </div>
            <div class="config-group">
                <label>Folder Name:</label>
                <input type="text" class="dest-name" data-key="${key}" value="${folder.name}">
            </div>
            <div class="config-group">
                <label>Folder Path:</label>
                <input type="text" class="dest-path" data-key="${key}" value="${folder.path}" readonly>
                <button class="select-folder-btn select-dest" data-key="${key}">Browse...</button>
            </div>
        `;
        destContainer.appendChild(folderDiv);
    });
    
    // Add event listeners for folder selection
    document.getElementById('select-source').addEventListener('click', async () => {
        const folder = await ipcRenderer.invoke('select-folder');
        if (folder) {
            document.getElementById('source-folder').value = folder;
        }
    });
    
    document.querySelectorAll('.select-dest').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const key = e.target.dataset.key;
            const folder = await ipcRenderer.invoke('select-folder');
            if (folder) {
                document.querySelector(`.dest-path[data-key="${key}"]`).value = folder;
            }
        });
    });
    
    configPanel.classList.add('active');
}

async function saveConfig() {
    const newConfig = {
        sourceFolder: document.getElementById('source-folder').value,
        destinationFolders: {}
    };
    
    document.querySelectorAll('.dest-key').forEach(input => {
        const key = input.dataset.key;
        const keyValue = input.value;
        const name = document.querySelector(`.dest-name[data-key="${key}"]`).value;
        const pathValue = document.querySelector(`.dest-path[data-key="${key}"]`).value;
        
        newConfig.destinationFolders[key] = {
            name: name,
            path: pathValue,
            key: keyValue
        };
    });
    
    const result = await ipcRenderer.invoke('save-config', newConfig);
    if (result.success) {
        config = newConfig;
        showStatus('Settings saved');
    } else {
        showStatus('Error saving settings', true);
    }
}

// Initialize app
init();
