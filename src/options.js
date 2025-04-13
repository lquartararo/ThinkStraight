const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

// Saves options to browserAPI.storage
async function saveOptions() {
  try {
    const options = {
      llmProvider: document.getElementById('llmProvider').value,
      apiKey: document.getElementById('apiKey').value,
      llmModel: document.getElementById('llmModel').value,
      customEndpoint: document.getElementById('customEndpoint').value,
    };

    await new Promise((resolve, reject) => {
      browserAPI.storage.sync.set(options, () => {
        if (browserAPI.runtime.lastError) {
          reject(browserAPI.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    status.style.color = '#4CAF50';
    setTimeout(() => {
      status.textContent = '';
    }, 750);
  } catch (error) {
    console.error('Error saving options:', error);
    const status = document.getElementById('status');
    status.textContent = 'Error saving options.';
    status.style.color = '#f44336';
  }
}

function getCustomPrompts() {
  try {
    const promptContainers = document.querySelectorAll('.prompt-container');
    return Array.from(promptContainers).map(container => ({
      id: snakeCase(container.querySelector('.prompt-title').value || ''),
      title: container.querySelector('.prompt-title').value || '',
      prompt: container.querySelector('.prompt-text').value || ''
    })).filter(prompt => prompt.title && prompt.prompt); // Filter out empty prompts
  } catch (error) {
    console.error('Error getting custom prompts:', error);
    return [];
  }
}

function snakeCase(str) {
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function restoreOptions() {
  try {
    const defaults = {
      llmProvider: 'gemini',
      apiKey: '',
      llmModel: 'gemini-2.0-flash',
      customEndpoint: '',
    };

    const items = await new Promise(resolve => {
      browserAPI.storage.sync.get(defaults, resolve);
    });

    const elementIds = ['llmProvider', 'apiKey', 'llmModel', 'customEndpoint'];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.value = items[id] || defaults[id];
      } else {
        console.warn(`Element with id '${id}' not found`);
      }
    });

    // Ensure all inputs are visible
    document.getElementById('apiKey').style.display = 'block';
    document.getElementById('llmModel').style.display = 'block';
    document.getElementById('customEndpoint').parentElement.style.display = 'block';

    updateUIForProvider(items.llmProvider);
  } catch (error) {
    console.error('Error restoring options:', error);
    showErrorMessage('Error restoring options. Please try reloading the page.');
  }
}

function updateUIForProvider(provider) {
  try {
    const apiKeyInput = document.getElementById('apiKey');
    const llmModelSelect = document.getElementById('llmModel');
    const customEndpointInput = document.getElementById('customEndpoint');
    const customEndpointContainer = customEndpointInput.parentElement;

    if (!apiKeyInput || !llmModelSelect || !customEndpointInput) {
      throw new Error('Required UI elements not found');
    }

    switch (provider) {
      case 'gemini':
        apiKeyInput.placeholder = 'Enter your Gemini API key';
        apiKeyInput.type = 'password';
        apiKeyInput.style.display = 'block';
        llmModelSelect.style.display = 'block';
        customEndpointContainer.style.display = 'block';
        break;
      default:
        console.warn(`Unknown provider: ${provider}`);
        break;
    }
  } catch (error) {
    console.error('Error updating UI for provider:', error);
    showErrorMessage('Error updating provider settings.');
  }
}

function addPromptToUI(title = '', prompt = '', id = '') {
  try {
    const promptsContainer = document.getElementById('prompts-container');
    const template = document.getElementById('prompt-template');
    
    if (!promptsContainer || !template) {
      throw new Error('Required elements not found');
    }

    const promptElement = template.content.cloneNode(true);

    const titleInput = promptElement.querySelector('.prompt-title');
    const textInput = promptElement.querySelector('.prompt-text');
    
    if (titleInput && textInput) {
      titleInput.value = title;
      textInput.value = prompt;
    }

    // Add a hidden input for the ID
    const idInput = document.createElement('input');
    idInput.type = 'hidden';
    idInput.className = 'prompt-id';
    idInput.value = id || snakeCase(title);
    
    const container = promptElement.querySelector('.prompt-container');
    if (container) {
      container.appendChild(idInput);
      
      const deleteButton = container.querySelector('.delete-prompt');
      if (deleteButton) {
        deleteButton.addEventListener('click', function() {
          container.remove();
          saveOptions(); // Auto-save when removing a prompt
        });
      }
    }

    promptsContainer.appendChild(promptElement);
  } catch (error) {
    console.error('Error adding prompt to UI:', error);
    showErrorMessage('Error adding new prompt.');
  }
}

function showErrorMessage(message) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.style.color = '#f44336';
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  }
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired');
  restoreOptions();

  const saveButton = document.getElementById('save');
  const providerSelect = document.getElementById('llmProvider');

  if (saveButton) {
    saveButton.addEventListener('click', saveOptions);
  }

  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => updateUIForProvider(e.target.value));
  }
});

// Autosave function for custom prompts
async function saveCustomPrompts(customPrompts) {
  try {
    await new Promise((resolve, reject) => {
      browserAPI.storage.sync.set({ customPrompts }, () => {
        if (browserAPI.runtime.lastError) {
          reject(browserAPI.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    console.log('Custom prompts saved');
  } catch (error) {
    console.error('Error saving custom prompts:', error);
    showErrorMessage('Error saving custom prompts.');
  }
}