# Twitter DM Archive

A Chrome extension that helps you organize and manage your Twitter/X Direct Messages by allowing you to archive conversations and easily restore them when needed.

![Twitter DM Archive Extension](https://github.com/ijp12367/x-dm-archiver/blob/main/icons/icon128.png?raw=true)

## Features

- **Archive Messages**: Hide conversations from your DM list without deleting them
- **Archive Panel**: View all archived messages in a dedicated panel
- **Search Functionality**: Easily find specific archived messages
- **Sort Options**: Sort your archived messages by newest or oldest
- **Restore Function**: Quickly restore any archived conversation back to your inbox
- **Drag & Drop**: Position the archive panel anywhere on your screen
- **Dark Mode Support**: Automatically adapts to Twitter's light or dark mode
- **Position Memory**: Remembers where you placed the archive panel

## Installation

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension should now be installed and active

## Usage

### Archiving Messages
1. Hover over any conversation in your Twitter DM list
2. Click the 📥 (inbox) button that appears in the bottom-right corner of the conversation
3. The conversation will be archived and hidden from view

### Accessing Archived Messages
1. Click the bookmark icon in the Twitter navigation bar (appears next to the settings icon)
2. The Archive Panel will open, displaying all archived conversations

### Managing Archived Messages
- **Search**: Use the search bar to find specific messages by username, handle, or message content
- **Sort**: Toggle between "Newest" and "Oldest" to change the sort order
- **Restore**: Click the "Restore" button next to any message to remove it from the archive, then click the refresh icon to ensure the message reappears in your main DM view
- **Clear All**: Remove all archived messages by clicking "Clear All" (confirmation required)

### Panel Customization
- **Move Panel**: Drag the panel using the ☰ (handle) at the top-left to position it anywhere on screen
- **Close Panel**: Click "Close" to hide the panel (your archives remain saved)

## Technical Details

- The extension uses Chrome's storage API to save archived messages locally in your browser
- No data is sent to external servers; everything is stored on your device
- Messages are archived with their content, username, timestamp, and avatar (when available)
- The extension automatically adapts to Twitter's layout and theme changes

## Privacy

This extension:
- Does not collect or transmit any user data
- Stores archived messages locally in your browser using Chrome's storage API
- Does not modify or interfere with Twitter's functionality beyond adding archive capabilities
- Requires only minimal permissions necessary for its functionality

## Troubleshooting

If the archive buttons don't appear:
1. Refresh the Twitter page
2. Click the "Refresh" button in the archive panel
3. If problems persist, try reinstalling the extension

If archived messages don't disappear:
1. Refresh the page
2. Click the "Refresh" button in the archive panel
