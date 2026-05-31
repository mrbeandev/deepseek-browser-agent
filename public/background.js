// Deepseek Browser Agent Background Service Worker

// 1. Enable Side Panel to open when clicking the extension toolbar icon
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("Error setting panel behavior:", error));

  // Create context menus for advanced user experience
  chrome.contextMenus.create({
    id: "summarize-page",
    title: "Summarize Page with Deepseek Browser Agent",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "explain-selection",
    title: "Explain selected text with Deepseek Browser Agent",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;

  // Open the side panel for the active window/tab
  chrome.sidePanel.open({ tabId: tab.id })
    .then(() => {
      // Send a message to the sidebar with a short delay to ensure it's loaded
      setTimeout(() => {
        if (info.menuItemId === "summarize-page") {
          chrome.runtime.sendMessage({
            action: "CONTEXT_MENU_SUMMARIZE",
            tabId: tab.id,
            url: tab.url
          }).catch(err => console.log("Sidebar not yet listening (summarize):", err));
        } else if (info.menuItemId === "explain-selection") {
          chrome.runtime.sendMessage({
            action: "CONTEXT_MENU_EXPLAIN",
            text: info.selectionText,
            tabId: tab.id,
            url: tab.url
          }).catch(err => console.log("Sidebar not yet listening (explain):", err));
        }
      }, 800);
    })
    .catch((error) => console.error("Error opening side panel via context menu:", error));
});

// Forward messaging between components if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "PING") {
    sendResponse({ status: "PONG" });
  }
  return true;
});
