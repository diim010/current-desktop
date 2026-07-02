// renderer/settings.js
// Handles the Settings page UI for manually setting the library folder.

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('library-dir-input');
  const browseBtn = document.getElementById('browse-dir-btn');
  const saveBtn = document.getElementById('settings-save-btn');
  const cancelBtn = document.getElementById('settings-cancel-btn');

  // Load current library path on open
  window.current.getLibraryPath().then(p => {
    if (p) input.value = p;
  });

  // Browse button opens a folder chooser dialog via preload bridge.
  browseBtn.addEventListener('click', async () => {
    try {
      const chosen = await window.current.chooseLibraryFolder();
      if (chosen) {
        input.value = chosen;
      }
    } catch (e) {
      console.error('Failed to choose folder:', e);
    }
  });

  // Save button validates and sends new path to main process.
  saveBtn.addEventListener('click', async () => {
    const newPath = input.value.trim();
    if (!newPath) {
      alert('Please enter a valid folder path.');
      return;
    }
    try {
      await window.current.setLibraryFolder(newPath);
      // Close the settings window on success
      window.close();
    } catch (e) {
      console.error('Failed to set library folder:', e);
      alert('Failed to change library folder: ' + e.message);
    }
  });

  // Cancel simply closes the window.
  cancelBtn.addEventListener('click', () => {
    window.close();
  });
});
