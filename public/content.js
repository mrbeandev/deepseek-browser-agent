// Deepseek Browser Agent Content Script
// This script runs on the active webpage and communicates with the Sidebar.

// Local page error logs buffer in content.js for debugging
const pageErrors = [];

const originalConsoleError = console.error;
console.error = (...args) => {
  pageErrors.push(`[CONTENT SCRIPT ERROR] ${args.join(' ')}`);
  originalConsoleError.apply(console, args);
};

window.addEventListener('error', (event) => {
  pageErrors.push(`[PAGE UNCAUGHT ERROR] ${event.message} at ${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason ? (event.reason.message || event.reason) : "unspecified reason";
  pageErrors.push(`[PAGE UNHANDLED REJECTION] ${reason}`);
});

// Listen for messages from the side panel or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case "PING":
        sendResponse({ success: true, message: "Content script is active" });
        break;

      case "GET_PAGE_ERRORS":
        sendResponse({ success: true, errors: pageErrors });
        break;

      case "GET_PAGE_TEXT": {
        const cleanText = extractPageText();
        sendResponse({ success: true, text: cleanText, title: document.title, url: window.location.href });
        break;
      }

      case "EXTRACT_ALL_LINKS": {
        const links = extractPageLinks();
        sendResponse({ success: true, links: links });
        break;
      }

      case "QUERY_DOM_ELEMENTS": {
        const elements = queryDomElements(request.selector);
        sendResponse({ success: true, elements: elements });
        break;
      }

      case "CLICK_ELEMENT":
        clickElement(request.selector, request.text)
          .then(result => sendResponse({ success: true, clicked: result }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        break;

      case "FILL_INPUT":
        fillInput(request.selector, request.value)
          .then(result => sendResponse({ success: true, filled: result }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        break;

      case "SCROLL_TO":
        performPageScroll(request.selector, request.direction, request.amount)
          .then(result => sendResponse({ success: true, scrolled: result }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        break;

      case "HIGHLIGHT_TEXT": {
        const highlightCount = highlightTextOnPage(request.query);
        sendResponse({ success: true, matchCount: highlightCount });
        break;
      }

      default:
        sendResponse({ success: false, error: "Unknown action: " + request.action });
    }
  } catch (error) {
    console.error("Error in Deepseek Browser Agent Content Script listener:", error);
    sendResponse({ success: false, error: error.message });
  }

  // Return true to indicate asynchronous response channel is needed
  return true;
});

/**
 * Cleanly extracts page text contents for the LLM
 */
function extractPageText() {
  const noiseSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio',
    'header', 'footer', 'nav', 'aside', '.nav', '.footer', '.header', '.sidebar',
    '.menu', '#menu', '#header', '#footer', '.comments', '#comments', '.ad', '.ads',
    '.popup', '.modal'
  ];

  const clone = document.body.cloneNode(true);
  
  noiseSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  let text = "";
  const contentSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'pre', 'code', 'table', 'article', 'main'];
  const nodes = clone.querySelectorAll(contentSelectors.join(','));

  if (nodes.length > 0) {
    nodes.forEach(node => {
      const tag = node.tagName.toLowerCase();
      const nodeText = node.innerText.trim();
      if (!nodeText) return;

      if (tag.startsWith('h')) {
        text += `\n\n# ${nodeText}\n`;
      } else if (tag === 'li') {
        text += `\n- ${nodeText}`;
      } else if (tag === 'pre' || tag === 'code') {
        text += `\n\`\`\`\n${nodeText}\n\`\`\`\n`;
      } else {
        text += `\n${nodeText}\n`;
      }
    });
  } else {
    text = clone.innerText;
  }

  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .substring(0, 70000); // Cap to 70,000 characters
}

/**
 * Extracts all links with descriptive context
 */
function extractPageLinks() {
  const links = [];
  const anchorElements = document.querySelectorAll('a');
  
  anchorElements.forEach(a => {
    const href = a.href;
    const text = a.innerText.trim();
    if (href && href.startsWith('http') && text) {
      if (!links.some(l => l.href === href && l.text === text)) {
        links.push({
          text: text.substring(0, 100),
          href: href
        });
      }
    }
  });

  return links.slice(0, 100);
}

/**
 * Queries the DOM and returns serializable representations
 */
function queryDomElements(selector) {
  try {
    const list = document.querySelectorAll(selector || 'a, button, input, textarea, select');
    const results = [];
    
    list.forEach((el, index) => {
      if (index >= 50) return;
      
      let label = el.innerText || el.placeholder || el.name || el.id || el.getAttribute('aria-label') || '';
      label = label.trim().substring(0, 100);

      results.push({
        tagName: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        type: el.type || null,
        label: label,
        selector: getUniqueCssSelector(el)
      });
    });
    return results;
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Helper to generate a relatively unique CSS selector for an element
 */
function getUniqueCssSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.tagName.toLowerCase() === 'body') return 'body';

  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = Array.from(el.classList).filter(c => !c.includes(':')).join('.');
      if (classes) selector += `.${classes}`;
    }
    
    let sibling = el;
    let nth = 1;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName.toLowerCase() === el.tagName.toLowerCase()) {
        nth++;
      }
    }
    if (nth > 1) {
      selector += `:nth-of-type(${nth})`;
    }

    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(' > ');
}

/**
 * Clicks a DOM element
 */
async function clickElement(selector, textSearch) {
  let target = null;

  if (selector && typeof selector === 'string') {
    target = document.querySelector(selector);
  }

  if (!target && textSearch) {
    const clickableTags = ['a', 'button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]', 'span', 'div'];
    const candidates = document.querySelectorAll(clickableTags.join(','));
    
    for (const el of candidates) {
      const elText = el.innerText || el.value || '';
      if (elText.toLowerCase().includes(textSearch.toLowerCase())) {
        target = el;
        break;
      }
    }
  }

  if (!target) {
    throw new Error(`Could not find clickable element matching: ${selector || textSearch}`);
  }

  target.scrollIntoView({ behavior: 'auto', block: 'center' });
  target.focus();
  
  const mouseEvents = ['mousedown', 'mouseup', 'click'];
  mouseEvents.forEach(eventType => {
    const event = new MouseEvent(eventType, {
      view: window,
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(event);
  });

  // Native click fallback for maximum reliability
  try {
    target.click();
  } catch (e) {
    console.warn("Native click fallback failed:", e);
  }

  return {
    tagName: target.tagName.toLowerCase(),
    text: (target.innerText || target.value || '').substring(0, 100).trim(),
    selector: getUniqueCssSelector(target)
  };
}

/**
 * Fills an input field with text
 */
async function fillInput(selector, value) {
  let target = null;

  if (selector && typeof selector === 'string') {
    target = document.querySelector(selector);
  }

  if (!target) {
    const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    for (const input of inputs) {
      const placeholder = input.placeholder || '';
      const name = input.name || '';
      const id = input.id || '';
      const searchMatch = (selector && typeof selector === 'string') ? selector.toLowerCase() : '';
      
      if (placeholder.toLowerCase().includes(searchMatch) || 
          name.toLowerCase().includes(searchMatch) || 
          id.toLowerCase().includes(searchMatch)) {
        target = input;
        break;
      }
    }
  }

  if (!target) {
    throw new Error(`Could not find input element matching: ${selector}`);
  }

  target.scrollIntoView({ behavior: 'auto', block: 'center' });
  target.focus();

  if (target.isContentEditable) {
    target.innerText = value;
  } else {
    target.value = value;
  }

  const inputEvent = new Event('input', { bubbles: true });
  target.dispatchEvent(inputEvent);
  
  const changeEvent = new Event('change', { bubbles: true });
  target.dispatchEvent(changeEvent);

  return {
    tagName: target.tagName.toLowerCase(),
    selector: getUniqueCssSelector(target),
    valueLength: value.length
  };
}

/**
 * Scrolls the page
 */
async function performPageScroll(selector, direction, amount = 300) {
  if (selector && typeof selector === 'string') {
    const target = document.querySelector(selector);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return `Scrolled to element: ${selector}`;
    }
  }

  let scrollX = window.scrollX;
  let scrollY = window.scrollY;

  if (direction === 'up') {
    scrollY = Math.max(0, scrollY - amount);
  } else if (direction === 'down') {
    scrollY = scrollY + amount;
  } else if (direction === 'top') {
    scrollY = 0;
  } else if (direction === 'bottom') {
    scrollY = document.body.scrollHeight;
  }

  window.scrollTo({
    left: scrollX,
    top: scrollY,
    behavior: 'smooth'
  });

  return `Scrolled ${direction || ''} by ${amount}px (New Y: ${scrollY})`;
}

/**
 * Highlights matches of a specific text string
 */
function highlightTextOnPage(query) {
  if (!query || query.length < 2) return 0;
  
  removeHighlights();

  let count = 0;
  const sel = window.getSelection();
  sel.removeAllRanges();

  while (window.find(query, false, false, true, false, true, false)) {
    count++;
    
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.className = 'deepseek-text-highlight';
    span.style.backgroundColor = 'rgba(0, 242, 254, 0.4)';
    span.style.borderBottom = '2px solid #00f2fe';
    span.style.borderRadius = '2px';
    
    try {
      range.surroundContents(span);
    } catch {
      // ignore failures on complex tag overlays
    }
    
    if (count >= 100) break;
  }
  
  const firstHighlight = document.querySelector('.deepseek-text-highlight');
  if (firstHighlight) {
    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return count;
}

function removeHighlights() {
  const highlights = document.querySelectorAll('.deepseek-text-highlight');
  highlights.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.innerText), span);
      parent.normalize();
    }
  });
}
