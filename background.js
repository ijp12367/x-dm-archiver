// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getArchived') {
    chrome.storage.local.get(['archivedMessages'], (result) => {
      sendResponse({ archived: result.archivedMessages || [] });
    });
    return true; // Indicates asynchronous response
  } else if (request.type === 'clearArchive') {
    chrome.storage.local.set({ archivedMessages: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
