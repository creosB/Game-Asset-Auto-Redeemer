# Game Asset Auto Redeemer

![Promo Tile](new%20images/promo%20tile.png)

Chrome/Edge Manifest V3 browser extension that automatically detects and claims free game assets on **FAB (Epic Games)**, **Unity Asset Store**, and **Superhive (Blender Market)**. Features a Dynamic Island-style overlay UI with real-time status tracking.

[![Chrome](https://raw.githubusercontent.com/creosB/creosB/refs/heads/main/assets/Chrome%20Web%20Store.svg)](https://chromewebstore.google.com/detail/game-asset-auto-redeemer/fbjceplloidnllfkmngbopibinmcbcaj)
[![Edge](https://raw.githubusercontent.com/creosB/creosB/2ca982c79eff856e6bf5bf8f647e8e9eaaab7cb4/assets/Edge.svg)](https://microsoftedge.microsoft.com/addons/detail/iocighnmjkjefcnaeboakllpmfgcmjda)
[![sponsor](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/creos)

## Supported Platforms

| Platform                                       | Status          | Method                                                                |
| ---------------------------------------------- | --------------- | --------------------------------------------------------------------- |
| [FAB (Epic Games)](https://www.fab.com)           | Fully supported | DOM-based card detection + license dialog automation                  |
| [Unity Asset Store](https://assetstore.unity.com) | Supported       | GraphQL API redemption with CSRF token handling                       |
| [Superhive (Blender Market)](https://superhivemarket.com) | Supported (add-to-cart) | Card detection + product-page form/CSRF POST + rate-limit aware pagination |

## Preview

| | | |
|:---:|:---:|:---:|
| ![1](new%20images/1.png) | ![2](new%20images/2.png) | ![3](new%20images/3.png) |
| ![Small Promo](new%20images/small%20promo.png) | ![Promo Tile](new%20images/promo%20tile.png) | |

## Features

- **Auto-claim** — scans pages for free assets and claims them automatically
- **Dynamic Island UI** — iPhone-inspired draggable overlay with collapsed/expanded states, Shadow DOM isolation, frosted glass aesthetic
- **License selection** — choose personal or professional license preference for FAB
- **Hide owned assets** — filters out assets already in your FAB library
- **Auto-pagination** — Unity: navigates to next page after claiming all free assets. Superhive: optional endless pagination that loads every result page before bulk add-to-cart
- **Superhive add-to-cart** — bulk adds every free Superhive product to cart using the site's real form/token flow, with rate-limit aware retries, status badges, and stop/resume. **Add-to-cart only — no checkout or purchase**
- **Live status** — per-asset status dots (claimed/failed/pending), claimed count badge, search/filter
- **Config persistence** — all settings synced via `chrome.storage.sync`
- **Notifications** — native Chrome notifications on completion or error
- **SPA-aware** — detects client-side navigation on FAB and Superhive via history API interception + MutationObserver

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` or `edge://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project root folder

No build step required — load directly as unpacked extension.

## Usage

1. Navigate to [FAB free assets](https://www.fab.com), [Unity Asset Store free assets](https://assetstore.unity.com), or [Superhive free products](https://superhivemarket.com)
2. The Dynamic Island overlay appears when supported assets are detected
3. Click the island to expand the control panel
4. Adjust settings (license type, delays, retries) as needed
5. Press **Start** (on Superhive: **Add free to cart**) — assets are processed automatically with live progress updates

### Auto-start

Enable **Auto-start** in the options or in-page panel to begin claiming automatically on page load.

## Configuration

Accessible via the Options page or the expanded in-page panel:

| Setting                      | Default          | Description                                     |
| ---------------------------- | ---------------- | ----------------------------------------------- |
| Preferred License            | `professional` | FAB license type (personal/professional)        |
| Delay Between Actions        | `2000ms`       | Wait between FAB claim attempts (500–10000ms)  |
| Max Retries                  | `2`            | Retry count on claim failure (0–5)             |
| Dialog Timeout               | `10000ms`      | Max wait for FAB license dialog (3000–30000ms) |
| Auto-start                   | `false`        | Start claiming on page load                     |
| Hide Owned Assets            | `true`         | Hide already-owned FAB assets                   |
| Unity Delay Between Products | `500ms`        | Wait between Unity claims (200–10000ms)        |
| Unity Auto-paginate          | `true`         | Navigate to next Unity page automatically       |
| Unity Delay Before Next Page | `10000ms`      | Wait before next Unity page (3000–60000ms)     |
| Superhive Enable             | `true`         | Show in-page panel on Superhive listings       |
| Superhive Free Only          | `true`         | Only treat $0/Free as eligible for bulk cart   |
| Superhive Endless Pagination | `false`        | Load all result pages before bulk add-to-cart  |
| Superhive Hide Non-Free      | `false`        | Visually hide paid cards when Free-Only is on  |
| Superhive Delay Between Assets | `1200ms`     | Wait between Superhive add-to-cart POSTs (500–10000ms) |
| Superhive Delay Between Pages | `700ms`       | Wait between page fetches during endless paging (200–10000ms) |
| Superhive Max Retries        | `4`            | Retries on 429/503 or 5xx (0–5)               |

## Project Structure

```
├── manifest.json                    # MV3 manifest (permissions, content scripts, service worker)
├── icons/                           # Extension icons + generation script
├── src/
│   ├── background/
│   │   └── service-worker.js        # Message routing, notifications, tab tracking, keep-alive
│   ├── content/
│   │   ├── shared/
│   │   │   ├── utils.js             # Helpers: wait, log, safeClick, waitForElement, retryWithBackoff
│   │   │   ├── state.js             # Global state: isRunning, assetsFound[], claimed/failed counts
│   │   │   ├── config.js            # Config load/save via chrome.storage.sync, change listener
│   │   │   ├── controller.js        # Start/stop orchestration, keep-alive pings
│   │   │   └── ui/
│   │   │       ├── styles.js        # Full CSS (Dynamic Island, panel, buttons, toggles)
│   │   │       ├── drag.js          # Mouse/touch drag for island and panel
│   │   │       ├── search.js        # Debounced asset search/filter
│   │   │       ├── assets-list.js   # Asset items with status indicators
│   │   │       ├── expanded-panel.js# Control panel: start/stop, config, asset list
│   │   │       └── dynamic-island.js# Shadow DOM host, collapsed pill, expand/collapse
│   │   ├── fab/
│   │   │   ├── index.js             # FAB init, free asset scanning, SPA navigation handling
│   │   │   ├── asset-processor.js   # Card detection, multi-tier button finding, claim flow
│   │   │   ├── license-processor.js # License dialog: radio selection, action button
│   │   │   └── hide-owned.js        # Hides owned assets via CSS + MutationObserver
│   │   └── unity/
│   │       ├── index.js             # Unity init, scanning, island creation
│   │       └── asset-processor.js   # GraphQL addToDownload mutation, auto-pagination
│   │   └── superhive/
│   │       ├── index.js             # Superhive init, listing detection, SPA nav, island creation
│   │       └── asset-processor.js   # Card detection, endless pagination, rate-limit aware add-to-cart POST
│   ├── popup/
│   │   ├── popup.html               # Browser action popup
│   │   ├── popup.css
│   │   └── popup.js                 # Status check, quick links
│   └── options/
│       ├── options.html             # Full settings page
│       ├── options.css
│       └── options.js               # Config management with validation
```

## Architecture

- **No build step** — vanilla JavaScript, IIFE modules, zero dependencies at runtime
- Shared state via `window.__fabGrabber` global namespace across content scripts
- Shadow DOM UI isolation prevents host page CSS conflicts
- ES module service worker for background processing
- SPA navigation detection: `history.pushState`/`replaceState` interception + `MutationObserver`


# License

---

## Please contact me first to share or make changes anywhere.
***
This work is licensed under a
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License][cc-by-nc-sa].

[![CC BY-NC-SA 4.0][cc-by-nc-sa-image]][cc-by-nc-sa]

[cc-by-nc-sa]: http://creativecommons.org/licenses/by-nc-sa/4.0/
[cc-by-nc-sa-image]: https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png
[cc-by-nc-sa-shield]: https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg
***

Feel free to adjust any specifics to better match your extension’s functionality or your preferred contact details!

<a href="https://artistscompany.net/">
  <img src="https://raw.githubusercontent.com/creosB/presentation/main/background.png" alt="Artists Company" width="800">
</a>
