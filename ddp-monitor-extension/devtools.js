// Register custom "DDP Monitor" tab in Chrome DevTools
chrome.devtools.panels.create(
  "DDP Monitor",
  "icons/icon16.png",
  "panel.html",
  function (panel) {
    console.log("[DDP Monitor] DevTools panel created successfully.");
  }
);
