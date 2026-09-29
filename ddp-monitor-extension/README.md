# Meteor DDP Traffic Monitor & Inspector - Chrome Extension (Manifest V3)

A Chrome Extension to monitor, inspect, filter, and analyze Meteor **DDP (Distributed Data Protocol)** real-time WebSocket traffic in Chrome DevTools.

---

## 🚀 Features

1. **Transparent DDP Interception**: Intercepts WebSocket and SockJS DDP frames (`connect`, `sub`, `unsub`, `method`, `result`, `ready`, `added`, `changed`, `removed`, `ping`, `pong`) in real-time without breaking application code or requiring Chrome debugging flags.
2. **Dedicated DevTools Panel**: Adds a **"DDP Monitor"** tab to Chrome DevTools (F12).
3. **RPC Method Latency Tracking**: Automatically measures round-trip time (RTT in ms) between `method` invocations and their `result`/`updated` responses.
4. **Live MiniMongo Collections Viewer**: Reconstructs the client-side collection document cache in real time based on incoming pub/sub `added`, `changed`, and `removed` messages.
5. **Subscriptions Manager**: Tracks active Meteor subscriptions, status (`pending` vs `ready`), duration, and parameters.
6. **Deep Payload Inspector**: Interactive JSON syntax highlighter and copy-to-clipboard tools for inspected frames.
7. **Filters & Full-Text Search**: Filter by frame type (Methods, Subscriptions, Collections, Pings) or search by method names, doc IDs, or payload text.
8. **Export Session**: Export captured traffic log as formatted JSON for offline analysis.
9. **Extension Toolbar Popup**: Quick status dashboard displaying total frames, active socket endpoint URL, active subscriptions count, bandwidth, and pause/resume controls.

---

## 🛠️ How to Load and Use in Google Chrome

1. Open **Google Chrome** and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left toolbar.
4. Select the `ddp-monitor-extension` folder inside this project directory (`/Users/Sagar/MeteorExp/ddp-monitor-extension`).
5. Open any Meteor application (e.g. `http://localhost:5173` running the included `meteor-ddp-client-studio` web app).
6. Open Chrome DevTools (**F12** or **Option + Cmd + I** on macOS).
7. Select the **"DDP Monitor"** tab in DevTools to start inspecting real-time DDP traffic!

---

## 📂 Architecture

- **`manifest.json`**: Extension configuration (Manifest V3).
- **`injected.js`**: Injected into main-world context to monkey-patch `WebSocket` and unwrap SockJS/DDP frames.
- **`content.js`**: Content script relaying events from the main world to the extension service worker.
- **`background.js`**: Extension Service Worker managing tab frame history, latency calculations, active subscriptions, and MiniMongo collections state.
- **`devtools.html` / `devtools.js`**: Registers the custom panel in Chrome DevTools.
- **`panel.html` / `panel.js` / `panel.css`**: The main DevTools UI app (Stream log, JSON inspector, MiniMongo store viewer, Subscriptions viewer).
- **`popup.html` / `popup.js` / `popup.css`**: Quick extension popup dashboard.
