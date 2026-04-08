# Zeusian Clip

Minimal Chrome Extension (Manifest V3) for quickly capturing selected text or the current page before moving into `Zeusian.ai`.

## What this first version does

- Captures the selected text from the active tab
- Saves a page snapshot when nothing is selected
- Stores recent clips in `chrome.storage.local`
- Adds context menu actions for selection and page capture
- Opens `https://zeusian.ai.kr/?auth=1&source=extension`

## Folder contents

- `manifest.json`: MV3 manifest
- `popup.html`, `popup.css`, `popup.js`: popup UI
- `background.js`: context menu and background actions
- `shared.js`: clip helpers and storage utilities

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Choose the `chrome-extension` folder

## Current workflow

1. Open any webpage
2. Select text, or leave the page as-is
3. Open the extension popup
4. Click `선택 텍스트 가져오기` or `현재 페이지 저장`
5. Copy the saved clip or open `Zeusian.ai`

## Next useful upgrade

- Push captured clips directly into the web app instead of only storing them inside the extension
- Add side panel mode
- Add import actions inside Zeusian.ai for extension-origin clips
