const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

const DEFAULT_PROMPTS = [
  { 
    id: 'analyze_bias', 
    title: 'Analyze Bias', 
    prompt: 'You are an expert in psychology and cognitive bias. You will receive a short message. Identify any cognitive biases present, explain clearly why they apply, and suggest how the person could think about the issue in a more balanced way — without rewriting the text. If no bias is found, respond with: "No cognitive bias detected." Avoid filler like "Sure" or "Here\'s the analysis." Return only the debiased text without quotes, explanations, or additional text:' 
  },
  { 
    id: 'debias_text', 
    title: 'Debias Text', 
    prompt: 'You are an expert in detecting cognitive bias and rewriting text to be more balanced, objective, and psychologically clear. You will receive a short message. If it contains bias, rewrite it to reduce that bias. After the rewrite, provide a short explanation of what was changed and why. If the message is harmful or cannot be ethically improved, say: "This message may cause harm and should not be sent. Please reconsider." If the message is acceptable as written, say: "The message is acceptable as written." Do not include preambles or conversational filler. Return only the debiased text without quotes, explanations, or additional text:' 
  }
];

if (typeof importScripts === 'function') {
  browserAPI.runtime.onInstalled.addListener(handleInstall);
} else {
  handleInstall({ reason: 'install' });
}

async function handleInstall(details) {
  if (details.reason === 'update') {
    log(`Extension updated from version ${details.previousVersion} to ${browserAPI.runtime.getManifest().version}`);
  }
  await updateContextMenu();
}

async function injectContentScript(tabId) {
  try {
    if (browserAPI === chrome) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    } else {
      await browser.tabs.executeScript(tabId, {
        file: 'content.js'
      });
    }
  } catch (error) {
    console.error('Failed to inject content script:', error);
    throw error;
  }
}

browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  browserAPI.storage.sync.get('customPrompts', async ({ customPrompts = [] }) => {
    const allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];
    if (allPrompts.some(prompt => prompt.id === info.menuItemId)) {
      try {
        try {
          await browserAPI.tabs.sendMessage(tab.id, { action: 'ping' });
          await sendEnhanceTextMessage(tab.id, info.menuItemId, info.selectionText);
        } catch (error) {
          await injectContentScript(tab.id);
          await sendEnhanceTextMessage(tab.id, info.menuItemId, info.selectionText);
        }
      } catch (error) {
        console.error('Error handling context menu click:', error);
      }
    }
  });
});

async function sendEnhanceTextMessage(tabId, promptId, selectedText) {
  try {
    await browserAPI.tabs.sendMessage(tabId, {
      action: 'enhanceText',
      promptId: promptId,
      selectedText: selectedText,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'enhanceText') {
    enhanceTextWithRateLimit(request.promptId, request.selectedText)
      .then(enhancedText => {
        sendResponse({ success: true, enhancedText });
      })
      .catch(error => {
        log(`Error enhancing text: ${error.message}`, 'error');
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  return false;
});

async function enhanceTextWithLLM(promptId, text) {
  const config = await getConfig();
  const llmProvider = config.llmProvider;
  const customPrompts = config.customPrompts || [];
  if (!llmProvider) {
    throw new Error('LLM provider not set. Please set it in the extension options.');
  }
  
  const allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];
  const prompt = allPrompts.find(p => p.id === promptId)?.prompt;
  if (!prompt) {
    throw new Error('Invalid prompt ID');
  }
  const fullPrompt = `${prompt}:\n\n${text}`;

  const enhanceFunctions = {
    gemini: enhanceWithGemini,
  };

  const enhanceFunction = enhanceFunctions[llmProvider];
  if (!enhanceFunction) {
    throw new Error('Invalid LLM provider selected');
  }

  return await enhanceFunction(fullPrompt);
}

async function enhanceWithGemini(prompt) {
  const config = await getConfig();
  if (!config.apiKey) {
    throw new Error('Gemini API key not set. Please set it in the extension options.');
  }

  const endpoint = config.customEndpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  try {
    const response = await fetch(`${endpoint}?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API request failed: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid response format from Gemini API');
    }
    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Failed to enhance text with Gemini. Error: ${error.message}`);
  }
}

const MAX_REQUESTS_PER_MINUTE = 10;
const RATE_LIMIT_RESET_INTERVAL = 60000;

const rateLimiter = (() => {
  let requestCount = 0;
  let lastResetTime = Date.now();
  const queue = [];

  const resetRateLimit = () => {
    const now = Date.now();
    if (now - lastResetTime > RATE_LIMIT_RESET_INTERVAL) {
      requestCount = 0;
      lastResetTime = now;
    }
  };

  const executeNext = () => {
    if (queue.length > 0) {
      resetRateLimit();
      if (requestCount < MAX_REQUESTS_PER_MINUTE) {
        const next = queue.shift();
        requestCount++;
        next.resolve(next.fn());
        if (queue.length > 0) {
          setTimeout(executeNext, RATE_LIMIT_RESET_INTERVAL / MAX_REQUESTS_PER_MINUTE);
        }
      } else {
        setTimeout(executeNext, RATE_LIMIT_RESET_INTERVAL - (Date.now() - lastResetTime));
      }
    }
  };

  return (fn) => {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      if (queue.length === 1) {
        executeNext();
      }
    });
  };
})();

const enhanceTextWithRateLimit = (promptId, text) => {
  return rateLimiter(() => enhanceTextWithLLM(promptId, text));
};

async function getConfig() {
  const defaults = {
    apiKey: '',
    llmProvider: 'gemini',
    llmModel: 'gemini-2.0-flash',
    customEndpoint: '',
    customPrompts: []
  };
  const config = await browserAPI.storage.sync.get(defaults);
  return {
    apiKey: config.apiKey,
    llmModel: config.llmModel,
    customEndpoint: config.customEndpoint,
    llmProvider: config.llmProvider,
    customPrompts: config.customPrompts
  };
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] ${message}`);
}

async function updateContextMenu() {
  try {
    await browserAPI.contextMenus.removeAll();
    const config = await getConfig();
    const customPrompts = config.customPrompts || [];
    const allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];

    await browserAPI.contextMenus.create({
      id: 'thinkstraight',
      title: 'ThinkStraight',
      contexts: ['selection'],
    });

    for (const prompt of allPrompts) {
      await browserAPI.contextMenus.create({
        id: prompt.id,
        parentId: 'thinkstraight',
        title: prompt.title,
        contexts: ['selection'],
      });
    }
  } catch (error) {
    console.error('Error updating context menu:', error);
  }
}

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.customPrompts) {
    updateContextMenu();
  }
});