const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

// Function to show enhanced text popup
function showEnhancedTextPopup(enhancedText) {
  // Get the selected text position
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Get the background color at the popup position
  const element = document.elementFromPoint(rect.left, rect.top);
  const computedStyle = window.getComputedStyle(element);
  const bgColor = computedStyle.backgroundColor;
  
  // Convert RGB to brightness value
  const rgb = bgColor.match(/\d+/g);
  const brightness = rgb ? (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000 : 255;
  const isDarkBackground = brightness < 128;
  
  // Create popup container
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.right + 20}px;
    background: ${isDarkBackground ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)'};
    backdrop-filter: blur(8px) brightness(${isDarkBackground ? '0.8' : '1.2'});
    -webkit-backdrop-filter: blur(8px) brightness(${isDarkBackground ? '0.8' : '1.2'});
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    max-width: 400px;
    max-height: 300px;
    overflow-y: auto;
    font-family: system-ui, -apple-system, sans-serif;
    border: 1px solid ${isDarkBackground ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.4)'};
    color-scheme: light dark;
    color: ${isDarkBackground ? '#fff' : '#000'};
    isolation: isolate;
    cursor: move;
    user-select: none;
  `;

  // Add drag functionality
  let isDragging = false;
  let offsetX, offsetY;

  popup.addEventListener('mousedown', (e) => {
    // Allow dragging from any part of the popup except the close button
    if (e.target !== closeButton) {
      isDragging = true;
      offsetX = e.clientX - popup.getBoundingClientRect().left;
      offsetY = e.clientY - popup.getBoundingClientRect().top;
      e.preventDefault(); // Prevent text selection while dragging
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      
      // Keep popup within viewport bounds
      const popupRect = popup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      const boundedX = Math.max(0, Math.min(x, viewportWidth - popupRect.width));
      const boundedY = Math.max(0, Math.min(y, viewportHeight - popupRect.height));
      
      popup.style.left = `${boundedX}px`;
      popup.style.top = `${boundedY}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #666;
    padding: 5px;
    user-select: none;
    z-index: 10001;
  `;
  closeButton.onclick = () => {
    popup.remove();
    overlay.remove();
  };

  // Create content container
  const content = document.createElement('div');
  
  // Simple markdown parser
  const markdownToHtml = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code>$1</code>') // Code
      .replace(/\n/g, '<br>'); // Line breaks
  };

  content.innerHTML = markdownToHtml(enhancedText);
  content.style.cssText = `
    white-space: pre-wrap;
    word-wrap: break-word;
    margin-right: 30px;
    font-size: 14px;
    line-height: 1.5;
    color: ${isDarkBackground ? '#fff' : '#000'};
    font-family: system-ui, -apple-system, sans-serif;
    text-shadow: ${isDarkBackground ? '0 0 1px rgba(0, 0, 0, 0.5)' : '0 0 1px rgba(255, 255, 255, 0.5)'};
  `;

  // Add style element for markdown elements
  const style = document.createElement('style');
  style.textContent = `
    .thinkstraight-popup-content strong {
      font-weight: bold;
      color: ${isDarkBackground ? '#fff' : '#000'};
    }
    .thinkstraight-popup-content em {
      font-style: italic;
      color: ${isDarkBackground ? '#fff' : '#000'};
    }
    .thinkstraight-popup-content code {
      font-family: monospace;
      background-color: ${isDarkBackground ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
      padding: 2px 4px;
      border-radius: 3px;
      color: ${isDarkBackground ? '#fff' : '#000'};
    }
  `;
  document.head.appendChild(style);

  // Assemble popup
  popup.appendChild(closeButton);
  popup.appendChild(content);
  document.body.appendChild(popup);

  // Add overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.05);
    z-index: 9999;
  `;
  overlay.onclick = () => {
    popup.remove();
    overlay.remove();
  };
  document.body.appendChild(overlay);

  // Adjust position if popup would go off screen
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (popupRect.right > viewportWidth) {
    popup.style.left = `${rect.left - popupRect.width - 20}px`;
  }

  if (popupRect.bottom > viewportHeight) {
    popup.style.top = `${viewportHeight - popupRect.height - 20}px`;
  }
}

// Listen for messages from the background script
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[THINKSTRAIGHT] Received message:', request);
  
  // Add support for ping message
  if (request.action === 'ping') {
    sendResponse({ success: true });
    return;
  }
  
  if (request.action === 'enhanceText') {
    enhanceSelectedText(request.promptId, request.selectedText)
      .then(enhancedText => {
        showEnhancedTextPopup(enhancedText);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error enhancing text:', error);
        showErrorNotification(error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates that the response is asynchronous
  }
});

// Function to enhance selected text
async function enhanceSelectedText(promptId, selectedText) {
  console.log('[THINKSTRAIGHT] Selected text:', promptId, selectedText);
  try {
    const response = await browserAPI.runtime.sendMessage({
      action: 'enhanceText',
      promptId: promptId,
      selectedText: selectedText,
    });
    console.log('[THINKSTRAIGHT] Response:', response);

    if (response.success) {
      return response.enhancedText;
    } else {
      throw new Error(response.error || 'Unknown error occurred');
    }
  } catch (error) {
    console.error('[THINKSTRAIGHT] Error in enhanceSelectedText:', error);
    throw error;
  }
}

// Function to replace the selected text with enhanced text
function replaceSelectedText(enhancedText) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

    // Handle text inputs and textareas
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || (activeElement.tagName === 'INPUT' && activeElement.type === 'text'))) {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      const text = activeElement.value;
      activeElement.value = text.substring(0, start) + enhancedText + text.substring(end);
      
      // Trigger input event for compatibility with reactive frameworks
      const inputEvent = new Event('input', { bubbles: true });
      activeElement.dispatchEvent(inputEvent);
      
      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      activeElement.dispatchEvent(changeEvent);
    } else {
      range.deleteContents();
      range.insertNode(document.createTextNode(enhancedText));
    }

    selection.removeAllRanges();
  }
}

// Function to show error notification
function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = `Error: ${message}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #ff4444;
    color: white;
    padding: 10px;
    border-radius: 5px;
    z-index: 9999;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.remove();
  }, 5000);
}