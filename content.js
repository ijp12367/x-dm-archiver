let isUpdatingArchive = false;
const processedMessages = new WeakSet();
let debounceTimer = null;
// Add a variable to track the current sort order
let currentSortOrder = 'newest'; // 'newest' or 'oldest'
// Add a variable to store the search query
let searchQuery = '';
// Add a variable to track panel position
let panelPosition = { left: null, top: null };

function getMessageId(msgElement) {
    return msgElement.getAttribute('data-item-id') || msgElement.innerText.slice(0, 30);
}

function debounce(func, wait) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, wait);
}

function safeAddArchiveButtons() {
    debounce(() => {
        if (!isUpdatingArchive) {
            addArchiveButtons();
            injectArchiveButton();
        }
    }, 300);
}

function forceRefreshMessageVisibility() {
    chrome.storage.local.get(['archivedMessages'], result => {
        const archived = result.archivedMessages || [];
        const archivedIds = new Set(archived.map(m => m.id));
        const messages = document.querySelectorAll('[data-testid="conversation"]');
        
        // Process in a non-blocking way using setTimeout
        // to prevent UI freezing with many messages
        let index = 0;
        
        function processNextBatch() {
            const endIndex = Math.min(index + 10, messages.length);
            
            for (let i = index; i < endIndex; i++) {
                const msg = messages[i];
                const msgId = getMessageId(msg);
                
                if (archivedIds.has(msgId)) {
                    msg.style.display = 'none';
                    msg.setAttribute('data-archived', 'true');
                } else {
                    msg.style.display = '';
                    msg.removeAttribute('data-archived');
                    msg.style.visibility = 'visible';
                    msg.style.opacity = '1';
                    void msg.offsetHeight; // Force reflow
                }
            }
            
            index = endIndex;
            
            if (index < messages.length) {
                setTimeout(processNextBatch, 0);
            }
        }
        
        processNextBatch();
    });
}

function addArchiveButtons() {
    if (window.location.pathname.includes('/messages/requests')) return;

    chrome.storage.local.get(['archivedMessages'], result => {
        const archived = result.archivedMessages || [];
        const archivedIds = new Set(archived.map(m => m.id));
        const messages = document.querySelectorAll('[data-testid="conversation"]');

        messages.forEach(msg => {
            if (processedMessages.has(msg)) return;
            const msgId = getMessageId(msg);

            if (!msg.querySelector('.archive-btn')) {
                // ✅ Modern floating button that matches Twitter's style
                const btn = document.createElement('button');
                btn.textContent = '📥';
                btn.className = 'archive-btn';
                btn.style.position = 'absolute';
                btn.style.bottom = '5px';
                btn.style.right = '5px';
                btn.style.width = '32px';
                btn.style.height = '32px';
                btn.style.fontSize = '16px';
                btn.style.backgroundColor = '#1d9bf0';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.style.borderRadius = '50%';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                btn.style.transition = 'background-color 0.2s';
                btn.style.opacity = '0'; // Start hidden
                btn.style.transition = 'opacity 0.2s ease-in-out';
                msg.style.position = 'relative'; // ✅ make parent relative
                
                // Show archive button on hover
                msg.addEventListener('mouseenter', () => {
                    btn.style.opacity = '1';
                });
                
                msg.addEventListener('mouseleave', () => {
                    btn.style.opacity = '0';
                });
                
                btn.onclick = (e) => {
                    e.stopPropagation();
                    archiveMessage(msg);
                };
                msg.appendChild(btn);
            }

            if (archivedIds.has(msgId)) {
                msg.style.display = 'none';
                msg.setAttribute('data-archived', 'true');
            } else {
                msg.style.display = '';
                msg.removeAttribute('data-archived');
            }

            processedMessages.add(msg);
        });
    });
}

function archiveMessage(msgElement) {
    const msgId = getMessageId(msgElement);
    
    // Store the entire HTML structure of the message for better reproduction in archive
    const msgHTML = msgElement.cloneNode(true).outerHTML;
    
    // Also store text content for fallback and search
    const msgContent = msgElement.innerText;
    
    // Try to extract the timestamp from the message
    let messageTimestamp = null;
    
    // Look for timestamps in the message (e.g., "· 1h", "· 3m", etc)
    const timeMatches = msgContent.match(/·\s*(\d+[hmd])/);
    if (timeMatches) {
        const timeMatch = timeMatches[1];
        const now = new Date();
        
        // Convert Twitter time format to a timestamp
        if (timeMatch.endsWith('m')) {
            const minutes = parseInt(timeMatch.slice(0, -1));
            messageTimestamp = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
        } else if (timeMatch.endsWith('h')) {
            const hours = parseInt(timeMatch.slice(0, -1));
            messageTimestamp = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
        } else if (timeMatch.endsWith('d')) {
            const days = parseInt(timeMatch.slice(0, -1));
            messageTimestamp = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
        }
    }
    
    // Look for date stamps in other formats if time wasn't found
    if (!messageTimestamp) {
        // Try matching patterns like "May 14" or "Apr 2"
        const dateMatches = msgContent.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
        if (dateMatches) {
            const month = dateMatches[1];
            const day = parseInt(dateMatches[2]);
            // Check if year is captured in the match
            const year = dateMatches[3] ? parseInt(dateMatches[3]) : new Date().getFullYear();
            
            // Map month name to month number
            const monthMap = {
                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
            };
            
            messageTimestamp = new Date(year, monthMap[month], day).toISOString();
        }
    }
    
    // Extract username from the message
    let username = '';
    let handle = '';
    
    // Try different DOM selectors for the username/handle
    // Twitter's structure is complex, so we try different selector patterns
    
    // Try to find the username directly from the conversation row
    const conversationLink = msgElement.querySelector('a[role="link"]');
    if (conversationLink) {
        const linkText = conversationLink.textContent.trim();
        // Check if there's a username with handle pattern
        const userMatch = linkText.match(/^([^@]+)(@\S+)/);
        if (userMatch) {
            username = userMatch[1].trim();
            handle = userMatch[2].trim();
        } else {
            username = linkText;
        }
    }
    
    // If we couldn't find the username from the link, try getting it from the first line of text
    if (!username) {
        // Look for any text content that might be a name
        const firstLine = msgContent.split('\n')[0].trim();
        // Check if it looks like a username (not "You accepted...")
        if (firstLine && !firstLine.includes('accepted') && !firstLine.includes('You')) {
            username = firstLine;
            
            // Check if there's a handle pattern in the first line
            const handleMatch = firstLine.match(/(@\S+)/);
            if (handleMatch) {
                handle = handleMatch[0];
                username = firstLine.replace(handle, '').trim();
            }
        }
    }
    
    // Last resort - extract from strong elements or spans
    if (!username) {
        const nameElement = msgElement.querySelector('strong, span[dir="auto"]');
        if (nameElement) {
            username = nameElement.textContent.trim();
        }
    }
    
    // Since Twitter displays either "Name" or "Name @handle", we parse that structure
    if (username && username.includes('@')) {
        const parts = username.split('@');
        if (parts.length > 1) {
            username = parts[0].trim();
            handle = '@' + parts[1].trim();
        }
    }
    
    // Fall back to name from the content if we still don't have one
    if (!username || username === 'You') {
        // Look for patterns in the content like "Name, CHOLO and 29 more"
        const contentMatch = msgContent.match(/([A-Za-z0-9_.-]+(?:,\s*[A-Za-z0-9_.-]+)*)(?:\s+and\s+\d+\s+more)?/);
        if (contentMatch) {
            username = contentMatch[1];
        } else {
            // Try to extract a name from various formats
            const lines = msgContent.split('\n');
            const potentialNames = lines.filter(line => 
                line.length > 0 && 
                !line.includes('You accepted') &&
                !line.includes('1h') &&
                line.length < 30
            );
            
            if (potentialNames.length > 0) {
                username = potentialNames[0];
            }
        }
    }
    
    // Final fallback if all extraction attempts failed
    if (!username || username === 'You') {
        // Extract from text nodes that are likely to contain the name
        const textNodes = [];
        function extractText(node) {
            if (node.nodeType === 3) {
                const text = node.textContent.trim();
                if (text && text.length > 0) {
                    textNodes.push(text);
                }
            } else if (node.nodeType === 1) {
                Array.from(node.childNodes).forEach(extractText);
            }
        }
        extractText(msgElement);
        
        // Look for potential name patterns (not common Twitter UI text)
        const potentialNames = textNodes.filter(text => 
            text.length > 1 && 
            !text.includes('You accepted') &&
            !text.includes('Message requests') &&
            !text.includes('accepted the request') &&
            !text.startsWith('You') &&
            text.length < 30
        );
        
        if (potentialNames.length > 0) {
            // Sort by length (shorter texts are more likely to be names)
            potentialNames.sort((a, b) => a.length - b.length);
            username = potentialNames[0];
            
            // Check if this contains a handle
            const handleMatch = username.match(/(@\S+)/);
            if (handleMatch) {
                handle = handleMatch[0];
                username = username.replace(handle, '').trim();
            }
        }
    }
    
    // For cases like "Natella, CHOLO and 29 more"
    if (username && username.includes(',')) {
        username = username.split(',')[0].trim();
    }
    
    // If username still has time markers like "· 1h", clean them
    if (username) {
        username = username.replace(/·\s*\d+[hm]/, '').trim();
    }
    
    // Extract actual message content
    let messageText = '';
    if (msgContent.includes('You accepted the request')) {
        messageText = 'You accepted the request';
    } else {
        // Try to get message content that isn't the name or handle
        const contentLines = msgContent.split('\n');
        if (contentLines.length > 1) {
            messageText = contentLines
                .slice(1)
                .filter(line => !line.includes(username) && !line.includes(handle))
                .join(' ')
                .trim();
        }
        
        if (!messageText) {
            messageText = 'You accepted the request';
        }
    }
    
    // Store avatar URL if it exists
    let avatarSrc = '';
    const avatar = msgElement.querySelector('img[src*="profile"]');
    if (avatar) {
        avatarSrc = avatar.src;
    }
    
    // Use known Twitter usernames patterns as fallback
    if ((!username || username === 'User') && msgContent.includes('eth')) {
        // Check for cryptocurrency usernames with .eth
        const ethMatch = msgContent.match(/([A-Za-z0-9_.-]+\.eth)/i);
        if (ethMatch) {
            username = ethMatch[1];
        }
    }
    
    // Clean up username one last time
    if (username) {
        // Remove any timestamps
        username = username.replace(/·\s*\d+[hmd]/, '').trim();
        
        // Remove any handles from username
        if (handle) {
            username = username.replace(handle, '').trim();
        }
    }

    chrome.storage.local.get(['archivedMessages'], result => {
        const archived = result.archivedMessages || [];
        if (!archived.some(m => m.id === msgId)) {
            archived.push({ 
                id: msgId, 
                content: msgContent,
                html: msgHTML,
                avatar: avatarSrc,
                username: username || 'User',
                handle: handle || '',
                timestamp: new Date().toISOString(),
                messageTimestamp: messageTimestamp || new Date().toISOString(), // Use extracted timestamp or now
                messagePreview: messageText || 'You accepted the request'
            });
            isUpdatingArchive = true;
            chrome.storage.local.set({ archivedMessages: archived }, () => {
                isUpdatingArchive = false;
                msgElement.style.display = 'none';
                msgElement.setAttribute('data-archived', 'true');
                refreshArchiveList();
            });
        }
    });
}

function restoreMessage(msgId) {
    chrome.storage.local.get(['archivedMessages'], result => {
        const archived = result.archivedMessages || [];
        // Find the message to restore (this helps with debugging)
        const messageToRestore = archived.find(m => m.id === msgId);
        
        // Filter out the message to restore
        const updatedArchive = archived.filter(m => m.id !== msgId);
        
        // Set flag to prevent other operations during update
        isUpdatingArchive = true;
        
        chrome.storage.local.set({ archivedMessages: updatedArchive }, () => {
            // Update the UI first
            refreshArchiveList();
            
            // Make the message visible in the chat
            const messages = document.querySelectorAll('[data-testid="conversation"]');
            let restoredMessage = null;
            
            // Check each message in the DOM
            messages.forEach(msg => {
                const currentMsgId = getMessageId(msg);
                if (currentMsgId === msgId) {
                    msg.style.display = '';
                    msg.removeAttribute('data-archived');
                    msg.style.visibility = 'visible';
                    msg.style.opacity = '1';
                    restoredMessage = msg;
                }
            });
            
            // Force DOM refresh
            if (restoredMessage) {
                void restoredMessage.offsetHeight;
            }
            
            // Force virtual list redraw
            forceVirtualListRedraw();
            
            // Release the lock
            isUpdatingArchive = false;
        });
    });
}

function forceVirtualListRedraw() {
    const container = document.querySelector('[role="presentation"]');
    if (container) {
        container.scrollTop += 1;
        container.scrollTop -= 1;
    } else {
        window.scrollBy(0, 1);
        window.scrollBy(0, -1);
    }
}

function injectArchiveButton() {
    const settingsIcon = document.querySelector('[aria-label="Settings"], [data-testid="settings"]');
    if (settingsIcon && !document.querySelector('#archiveListBtn')) {
        const archiveBtn = document.createElement('button');
        archiveBtn.id = 'archiveListBtn';
        archiveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                <g><path d="M19.9 23.5c-.2 0-.3 0-.4-.1L12 17.9l-7.5 5.4c-.2.2-.5.2-.8.1-.2-.1-.4-.4-.4-.7V5.6c0-1.2 1-2.2 2.2-2.2h12.8c1.2 0 2.2 1 2.2 2.2v17.1c0 .3-.2.5-.4.7 0 .1-.1.1-.2.1z"></path></g>
            </svg>
        `;
        archiveBtn.title = 'Toggle Archive Panel';
        archiveBtn.style.marginLeft = '10px';
        archiveBtn.style.border = 'none';
        archiveBtn.style.background = 'none';
        archiveBtn.style.cursor = 'pointer';
        archiveBtn.style.borderRadius = '50%';
        archiveBtn.style.width = '36px';
        archiveBtn.style.height = '36px';
        archiveBtn.style.display = 'flex';
        archiveBtn.style.alignItems = 'center';
        archiveBtn.style.justifyContent = 'center';
        archiveBtn.onclick = toggleArchivePanel;
        
        // Handle hover state
        archiveBtn.addEventListener('mouseenter', () => {
            archiveBtn.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
        });
        
        archiveBtn.addEventListener('mouseleave', () => {
            archiveBtn.style.backgroundColor = 'transparent';
        });
        
        settingsIcon.parentElement.appendChild(archiveBtn);
    }
}

function toggleArchivePanel() {
    const existingPanel = document.querySelector('#archivePanel');
    if (existingPanel) {
        existingPanel.remove();
    } else {
        showArchivePanel();
    }
}

function showArchivePanel() {
    // Load the saved panel position
    chrome.storage.local.get(['panelPosition'], result => {
        const savedPosition = result.panelPosition || {};
        panelPosition = savedPosition;
        
        const panel = document.createElement('div');
        panel.id = 'archivePanel';
        panel.style.position = 'fixed';
        
        // Apply saved position if available, otherwise use default position
        if (panelPosition.left !== undefined && panelPosition.top !== undefined) {
            panel.style.left = panelPosition.left + 'px';
            panel.style.top = panelPosition.top + 'px';
        } else {
            panel.style.top = '80px';
            panel.style.right = '20px';
        }
        
        panel.style.width = '460px'; // Increased width to accommodate longer usernames and dates
        panel.style.maxHeight = '80vh';
        panel.style.backgroundColor = '#ffffff';
        panel.style.border = 'none';
        panel.style.borderRadius = '16px';
        panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        panel.style.zIndex = '9999';
        panel.style.overflow = 'hidden';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        
        // Detect if the site is in dark mode
        const isDarkMode = document.body.classList.contains('night-mode') || 
                          document.documentElement.classList.contains('dark') ||
                          document.querySelector('html[data-color-mode="dark"]') !== null ||
                          window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (isDarkMode) {
            panel.style.backgroundColor = '#15202b';
            panel.style.color = '#ffffff';
        }
        
        // Updated header with sort controls and drag handle
        panel.innerHTML = `
            <div id="archiveHeader" style="padding: 16px; border-bottom: 1px solid ${isDarkMode ? '#38444d' : '#eff3f4'}; display: flex; justify-content: space-between; align-items: center; cursor: move;">
                <div style="display: flex; align-items: center;">
                    <span class="drag-handle" style="margin-right: 10px; font-size: 16px; color: ${isDarkMode ? '#8899a6' : '#536471'};">☰</span>
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: ${isDarkMode ? '#ffffff' : '#0f1419'};">Archived DMs</h2>
                </div>
                <div>
                    <button id="clearArchive" style="background: ${isDarkMode ? '#2d3741' : '#eff3f4'}; border: none; border-radius: 9999px; padding: 6px 16px; margin-right: 8px; cursor: pointer; color: ${isDarkMode ? '#ffffff' : '#0f1419'}; font-weight: 500; font-size: 14px;">Clear All</button>
                    <button id="closeArchive" style="background: ${isDarkMode ? '#2d3741' : '#eff3f4'}; border: none; border-radius: 9999px; padding: 6px 16px; cursor: pointer; color: ${isDarkMode ? '#ffffff' : '#0f1419'}; font-weight: 500; font-size: 14px;">Close</button>
                </div>
            </div>
            <div style="padding: 12px 16px; border-bottom: 1px solid ${isDarkMode ? '#38444d' : '#eff3f4'};">
                <div style="display: flex; position: relative; margin-bottom: 12px;">
                    <input id="archiveSearch" type="text" placeholder="Search archived messages..." style="width: 100%; padding: 8px 12px 8px 36px; border-radius: 9999px; border: 1px solid ${isDarkMode ? '#38444d' : '#eff3f4'}; background-color: ${isDarkMode ? '#253341' : '#f7f9f9'}; color: ${isDarkMode ? '#ffffff' : '#0f1419'}; font-size: 14px; outline: none;">
                    <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: ${isDarkMode ? '#8899a6' : '#536471'};">🔍</span>
                    <button id="clearSearch" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; padding: 0; cursor: pointer; color: ${isDarkMode ? '#8899a6' : '#536471'}; font-size: 16px; display: none;">×</button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 15px; font-weight: 500; color: ${isDarkMode ? '#ffffff' : '#0f1419'}; margin-right: 12px;">Sort:</span>
                        <div class="sort-buttons" style="display: flex; gap: 8px;">
                            <button id="sortNewest" class="sort-btn ${currentSortOrder === 'newest' ? 'active' : ''}" style="background: ${currentSortOrder === 'newest' ? '#1d9bf0' : (isDarkMode ? '#2d3741' : '#eff3f4')}; border: none; border-radius: 9999px; padding: 6px 12px; cursor: pointer; color: ${currentSortOrder === 'newest' ? '#ffffff' : (isDarkMode ? '#ffffff' : '#0f1419')}; font-weight: 500; font-size: 14px;">Newest</button>
                            <button id="sortOldest" class="sort-btn ${currentSortOrder === 'oldest' ? 'active' : ''}" style="background: ${currentSortOrder === 'oldest' ? '#1d9bf0' : (isDarkMode ? '#2d3741' : '#eff3f4')}; border: none; border-radius: 9999px; padding: 6px 12px; cursor: pointer; color: ${currentSortOrder === 'oldest' ? '#ffffff' : (isDarkMode ? '#ffffff' : '#0f1419')}; font-weight: 500; font-size: 14px;">Oldest</button>
                        </div>
                    </div>
                    <button id="refreshPage" class="refresh-btn" style="background: ${isDarkMode ? '#2d3741' : '#eff3f4'}; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${isDarkMode ? '#ffffff' : '#0f1419'};" title="Refresh Page">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 4v6h-6"></path>
                            <path d="M1 20v-6h6"></path>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div id="archiveList" style="padding: 0; overflow-y: auto; max-height: calc(68px * 10); flex: 1;"></div>
        `;
        
        document.body.appendChild(panel);

        document.getElementById('closeArchive').onclick = () => panel.remove();
        document.getElementById('clearArchive').onclick = () => {
            if (confirm('Are you sure you want to clear all archived messages?')) {
                isUpdatingArchive = true;
                chrome.storage.local.set({ archivedMessages: [] }, () => {
                    isUpdatingArchive = false;
                    forceRefreshMessageVisibility();
                    refreshArchiveList();
                });
            }
        };
        
        // Add refresh button functionality
        document.getElementById('refreshPage').addEventListener('click', () => {
            window.location.reload();
        });
        
        // Set up search functionality
        const searchInput = document.getElementById('archiveSearch');
        const clearSearchBtn = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
            refreshArchiveList();
        });
        
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchQuery = '';
            clearSearchBtn.style.display = 'none';
            refreshArchiveList();
        });
        
        // Add event listeners for sort buttons
        document.getElementById('sortNewest').addEventListener('click', () => {
            if (currentSortOrder !== 'newest') {
                currentSortOrder = 'newest';
                updateSortButtonStyles();
                refreshArchiveList();
            }
        });
        
        document.getElementById('sortOldest').addEventListener('click', () => {
            if (currentSortOrder !== 'oldest') {
                currentSortOrder = 'oldest';
                updateSortButtonStyles();
                refreshArchiveList();
            }
        });
        
        // Make the panel draggable
        makeDraggable(panel, document.getElementById('archiveHeader'));

        refreshArchiveList();
    });
}

// Function to make an element draggable
function makeDraggable(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;
    
    handle.addEventListener('mousedown', (e) => {
        // Only handle left mouse button
        if (e.button !== 0) return;
        
        e.preventDefault();
        isDragging = true;
        
        // Calculate the offset between mouse position and element top-left corner
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        // Add cursor style to indicate dragging
        document.body.style.cursor = 'move';
        
        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        // Calculate the new position, accounting for the initial offset
        const newLeft = e.clientX - offsetX;
        const newTop = e.clientY - offsetY;
        
        // Apply the new position
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
        element.style.right = 'auto'; // Ensure right is not set
        element.style.bottom = 'auto'; // Ensure bottom is not set
        
        // Update the stored position
        panelPosition = { left: newLeft, top: newTop };
        
        // Save the position to Chrome storage
        chrome.storage.local.set({ panelPosition: panelPosition });
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            
            // Restore cursor style
            document.body.style.cursor = '';
            
            // Restore text selection
            document.body.style.userSelect = '';
        }
    });
    
    // In case the mouse leaves the window while dragging
    document.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Helper function to update the appearance of sort buttons
function updateSortButtonStyles() {
    const isDarkMode = document.body.classList.contains('night-mode') || 
                      document.documentElement.classList.contains('dark') ||
                      document.querySelector('html[data-color-mode="dark"]') !== null ||
                      window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const newestBtn = document.getElementById('sortNewest');
    const oldestBtn = document.getElementById('sortOldest');
    
    if (newestBtn && oldestBtn) {
        // Update newest button
        newestBtn.style.background = currentSortOrder === 'newest' ? '#1d9bf0' : (isDarkMode ? '#2d3741' : '#eff3f4');
        newestBtn.style.color = currentSortOrder === 'newest' ? '#ffffff' : (isDarkMode ? '#ffffff' : '#0f1419');
        
        // Update oldest button
        oldestBtn.style.background = currentSortOrder === 'oldest' ? '#1d9bf0' : (isDarkMode ? '#2d3741' : '#eff3f4');
        oldestBtn.style.color = currentSortOrder === 'oldest' ? '#ffffff' : (isDarkMode ? '#ffffff' : '#0f1419');
    }
}

function refreshArchiveList() {
    chrome.storage.local.get(['archivedMessages'], result => {
        const archived = result.archivedMessages || [];
        const list = document.getElementById('archiveList');
        if (!list) return;
        list.innerHTML = '';
        
        // Detect if the site is in dark mode
        const isDarkMode = document.body.classList.contains('night-mode') || 
                          document.documentElement.classList.contains('dark') ||
                          document.querySelector('html[data-color-mode="dark"]') !== null ||
                          window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Filter archived messages based on search query
        const filteredArchived = searchQuery ? 
            archived.filter(msg => {
                const username = (msg.username || '').toLowerCase();
                const handle = (msg.handle || '').toLowerCase();
                const content = (msg.messagePreview || '').toLowerCase();
                return username.includes(searchQuery) || 
                       handle.includes(searchQuery) || 
                       content.includes(searchQuery);
            }) : 
            archived;
        
        if (filteredArchived.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 40px 20px; color: ${isDarkMode ? '#8899a6' : '#536471'}; font-size: 15px;">
                ${searchQuery ? 'No matches found. Try a different search term.' : 'No archived messages'}
            </div>`;
            return;
        }
        
        // Sort messages by timestamp, respecting the current sort order
        filteredArchived.sort((a, b) => {
            // Use messageTimestamp if available, otherwise use timestamp
            const aTime = a.messageTimestamp ? new Date(a.messageTimestamp) : (a.timestamp ? new Date(a.timestamp) : new Date(0));
            const bTime = b.messageTimestamp ? new Date(b.messageTimestamp) : (b.timestamp ? new Date(b.timestamp) : new Date(0));
            
            // Sort based on the currentSortOrder
            return currentSortOrder === 'newest' ? (bTime - aTime) : (aTime - bTime);
        });
        
        // Add scrollbar styling for webkit browsers
        list.style.scrollbarWidth = 'thin';
        list.style.scrollbarColor = isDarkMode ? '#38444d transparent' : '#cfd9de transparent';
        
        // Add a wrapper for custom scrollbar styling
        const scrollbarStyles = document.createElement('style');
        scrollbarStyles.textContent = `
            #archiveList::-webkit-scrollbar {
                width: 4px;
            }
            #archiveList::-webkit-scrollbar-track {
                background: transparent;
            }
            #archiveList::-webkit-scrollbar-thumb {
                background-color: ${isDarkMode ? '#38444d' : '#cfd9de'};
                border-radius: 4px;
            }
        `;
        document.head.appendChild(scrollbarStyles);
        
        // Function to get Twitter-style relative time (now, 1m, 5h, etc.) with improved year handling
        function getRelativeTime(timestamp) {
            if (!timestamp) return '1h'; // Fallback
            
            const now = new Date();
            const messageTime = new Date(timestamp);
            const diffSeconds = Math.floor((now - messageTime) / 1000);
            const diffYears = now.getFullYear() - messageTime.getFullYear();
            
            // If less than 24 hours, show hours or minutes
            if (diffSeconds < 24 * 60 * 60) {
                if (diffSeconds < 60) return 'now';
                
                const diffMinutes = Math.floor(diffSeconds / 60);
                if (diffMinutes < 60) return `${diffMinutes}m`;
                
                const diffHours = Math.floor(diffMinutes / 60);
                return `${diffHours}h`;
            } 
            // If more than a year ago, show only month and year
            else if (diffYears > 0) {
                return new Intl.DateTimeFormat('en-US', { 
                    month: 'short', 
                    year: 'numeric'
                }).format(messageTime);
            }
            // If less than a year ago but more than 24 hours, show month and day
            else {
                return new Intl.DateTimeFormat('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                }).format(messageTime);
            }
        }
        
        filteredArchived.forEach(msg => {
            const msgContainer = document.createElement('div');
            msgContainer.className = 'archived-message';
            msgContainer.style.position = 'relative';
            msgContainer.style.padding = '12px 16px';
            msgContainer.style.height = '68px'; // Fixed height for each message
            msgContainer.style.boxSizing = 'border-box';
            msgContainer.style.borderBottom = `1px solid ${isDarkMode ? '#38444d' : '#eff3f4'}`;
            msgContainer.style.backgroundColor = isDarkMode ? '#15202b' : '#ffffff';
            msgContainer.style.transition = 'background-color 0.2s';
            
            // Get username and handle from stored values
            const username = msg.username || 'User';
            const handle = msg.handle || '';
            
            // Get message preview, making sure it doesn't contain the handle
            let messagePreview = msg.messagePreview || 'You accepted the request';
            
            // Remove any handle from message preview
            if (handle && messagePreview.includes(handle)) {
                messagePreview = messagePreview.replace(handle, '').trim();
            }
            
            // Remove any @ mentions from the message preview
            messagePreview = messagePreview.replace(/@[A-Za-z0-9_.-]+/g, '').trim();
            
            // Clean up common Twitter DM text patterns
            messagePreview = messagePreview
                .replace('You accepted the request', 'You accepted the request')
                .replace(/\s+/g, ' ')
                .trim();
            
            // Clean up timestamps in message preview
            messagePreview = messagePreview.replace(/·\s*\d+[hmd]/g, '').trim();
            
            // Get relative time from the message timestamp (if available) or archive timestamp
            const timeToUse = msg.messageTimestamp || msg.timestamp;
            const relativeTime = getRelativeTime(timeToUse);
            
            // Highlight search terms if there's a search query
            let highlightedUsername = username;
            let highlightedHandle = handle;
            let highlightedMessagePreview = messagePreview;
            
            if (searchQuery) {
                const highlightFn = (text) => {
                    if (!text) return '';
                    return text.replace(new RegExp(searchQuery, 'gi'), match => 
                        `<span style="background-color: ${isDarkMode ? '#1c4563' : '#c1e7ff'}; color: ${isDarkMode ? '#ffffff' : '#0f1419'}">${match}</span>`
                    );
                };
                
                highlightedUsername = highlightFn(username);
                highlightedHandle = highlightFn(handle);
                highlightedMessagePreview = highlightFn(messagePreview);
            }
            
            // Try to recreate the message layout to match the screenshot
            const messageHTML = `
                <div style="display: flex; align-items: flex-start; height: 100%;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; margin-right: 12px; flex-shrink: 0; background-color: ${isDarkMode ? '#2d3741' : '#eff3f4'};">
                        ${msg.avatar ? `<img src="${msg.avatar}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; overflow: hidden;">
                        <div style="display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span style="color: ${isDarkMode ? '#ffffff' : '#0f1419'}; font-size: 15px; font-weight: 500; overflow: hidden; text-overflow: ellipsis;">
                                ${highlightedUsername} ${highlightedHandle} · ${relativeTime}
                            </span>
                        </div>
                        <div style="margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span style="color: ${isDarkMode ? '#8899a6' : '#536471'}; font-size: 14px; overflow: hidden; text-overflow: ellipsis;">
                                ${highlightedMessagePreview}
                            </span>
                        </div>
                    </div>
                    <button class="restore-btn" style="background-color: #1d9bf0; color: white; border: none; border-radius: 9999px; padding: 6px 16px; font-size: 14px; font-weight: 700; cursor: pointer; margin-left: 12px; align-self: center;">Restore</button>
                </div>
            `;
            
            msgContainer.innerHTML = messageHTML;
            
            // Add hover state for the message container
            msgContainer.addEventListener('mouseenter', () => {
                msgContainer.style.backgroundColor = isDarkMode ? '#1e2732' : '#f7f9f9';
            });
            
            msgContainer.addEventListener('mouseleave', () => {
                msgContainer.style.backgroundColor = isDarkMode ? '#15202b' : '#ffffff';
            });
            
            // Add click handler to the restore button
            const restoreBtn = msgContainer.querySelector('.restore-btn');
            restoreBtn.onclick = (e) => {
                e.stopPropagation();
                restoreMessage(msg.id);
            };
            
            list.appendChild(msgContainer);
        });
    });
}

const observer = new MutationObserver(mutations => {
    if (isUpdatingArchive) return;
    const relevant = mutations.some(mutation =>
        Array.from(mutation.addedNodes).some(node =>
            node.nodeType === 1 && 
            (node.matches('[data-testid="conversation"]') || 
             node.querySelector('[data-testid="conversation"]'))
        )
    );
    if (relevant) safeAddArchiveButtons();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.archivedMessages) {
        if (isUpdatingArchive) return;
        refreshArchiveList();
        forceRefreshMessageVisibility();
    }
});

// Apply some global styles
const style = document.createElement('style');
style.textContent = `
    #archivePanel {
        font-family: "TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    .restore-btn {
        opacity: 1;
        transition: background-color 0.2s;
    }
    
    .restore-btn:hover {
        background-color: #1a8cd8 !important;
    }
    
    .archive-btn:hover {
        background-color: #1a8cd8 !important;
    }
    
    .sort-btn {
        transition: background-color 0.2s, color 0.2s;
    }
    
    .sort-btn:hover {
        background-color: #1a8cd8 !important;
        color: white !important;
    }
    
    .drag-handle {
        cursor: move;
        user-select: none;
    }
    
    #archiveHeader {
        user-select: none;
    }
    
    .refresh-btn {
        transition: transform 0.3s, background-color 0.2s;
    }
    
    .refresh-btn:hover {
        background-color: #1a8cd8 !important;
        color: white !important;
        transform: rotate(180deg);
    }
`;
document.head.appendChild(style);

observer.observe(document.body, { childList: true, subtree: true });

addArchiveButtons();
injectArchiveButton();