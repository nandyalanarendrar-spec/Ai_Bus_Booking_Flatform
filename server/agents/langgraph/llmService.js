/**
 * Ollama LLM Service
 * 
 * Connects to local Ollama instance using llama3.2 model.
 * Provides LLM capabilities for the LangGraph agents.
 */
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const OLLAMA_CONFIG = {
  host: 'localhost',
  port: 11434,
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434',
  // Fallback options
  timeout: 60000, // 60 seconds timeout
  maxRetries: 2,
  startupTimeoutMs: 90000
};

function isGeminiEnabled() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  return provider === 'gemini' || !!process.env.GEMINI_API_KEY;
}

function callGeminiApi(prompt, systemPrompt = null, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('GEMINI_API_KEY environment variable is not set.'));
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const { temperature = 0.7, maxTokens = 1024 } = options;

  const contents = [];
  if (systemPrompt) {
    contents.push({
      role: 'user',
      parts: [{ text: `System Instruction: ${systemPrompt}` }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Understood. I will follow these instructions.' }]
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const postData = JSON.stringify({
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.candidates && parsed.candidates[0]?.content?.parts[0]?.text) {
            resolve(parsed.candidates[0].content.parts[0].text);
          } else if (parsed.error) {
            reject(new Error(`Gemini API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          } else {
            resolve(data);
          }
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', err => reject(new Error(`Gemini connection failed: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

function callGeminiChat(messages, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('GEMINI_API_KEY environment variable is not set.'));
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const { temperature = 0.7, maxTokens = 1024 } = options;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.role === 'system' ? `System Instruction: ${m.content}` : m.content }]
  }));

  const postData = JSON.stringify({
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.candidates && parsed.candidates[0]?.content?.parts[0]?.text) {
            resolve(parsed.candidates[0].content.parts[0].text);
          } else if (parsed.error) {
            reject(new Error(`Gemini API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          } else {
            resolve(data);
          }
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', err => reject(new Error(`Gemini connection failed: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

const readinessState = {
  ready: false,
  lastError: null,
  startupPromise: null,
  checkedAt: null
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractOllamaError(output) {
  const text = (output || '').toLowerCase();
  if (text.includes('not recognized') || text.includes('enoent')) {
    return 'Ollama CLI was not found. Install Ollama and ensure the `ollama` command is available in PATH.';
  }
  if (text.includes('model') && text.includes('not found')) {
    return `Model ${OLLAMA_CONFIG.model} is missing. Pull it using: ollama pull ${OLLAMA_CONFIG.model}`;
  }
  if (text.includes('pull model manifest') || text.includes('file does not exist')) {
    return `Model ${OLLAMA_CONFIG.model} is missing. Pull it using: ollama pull ${OLLAMA_CONFIG.model}`;
  }
  if (text.includes('connect') || text.includes('failed to connect') || text.includes('connection refused')) {
    return `Cannot connect to Ollama at ${OLLAMA_CONFIG.baseUrl}. Start Ollama first.`;
  }
  return null;
}

function runOllamaCommand(args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const child = spawn('ollama', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Failed to execute ollama command: ${err.message}`));
    });

    child.on('close', code => {
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`.trim();
      if (timedOut) {
        return reject(new Error(`Ollama command timed out: ollama ${args.join(' ')}`));
      }
      if (code !== 0) {
        const specificError = extractOllamaError(output);
        return reject(new Error(specificError || `Ollama command failed (exit ${code}): ${output}`));
      }
      resolve({ stdout, stderr, output });
    });
  });
}

async function waitForOllamaServer(timeoutMs = OLLAMA_CONFIG.startupTimeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isAvailable()) return true;
    await delay(1000);
  }
  return false;
}

async function ensureModelInstalled() {
  const modelInfo = await getModelInfo().catch(() => null);
  if (!modelInfo || modelInfo.available === false) {
    console.log(`Model ${OLLAMA_CONFIG.model} is missing. Pulling it using: ollama pull ${OLLAMA_CONFIG.model}...`);
    try {
      await runOllamaCommand(['pull', OLLAMA_CONFIG.model], 300000); // 5 mins timeout
      console.log(`Successfully pulled ${OLLAMA_CONFIG.model}`);
    } catch (pullError) {
      throw new Error(`Failed to pull model ${OLLAMA_CONFIG.model}: ${pullError.message}`);
    }
  }
  return modelInfo;
}

async function startOllamaServe() {
  if (await isAvailable()) {
    return;
  }

  try {
    const serveProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    serveProcess.unref();
    console.log(`Starting Ollama serve on ${OLLAMA_CONFIG.baseUrl}...`);
  } catch (error) {
    console.warn(`Ollama CLI is unavailable: ${error.message}`);
    return;
  }

  const ready = await waitForOllamaServer(15000);
  if (!ready) {
    console.warn(`Ollama did not become ready at ${OLLAMA_CONFIG.baseUrl} within the startup window.`);
  }
}

async function activateModel() {
  // Requirement: use `ollama run llama3.2` to activate/warm model.
  await runOllamaCommand(['run', OLLAMA_CONFIG.model, 'Respond with READY only.']);
}

async function ensureReady() {
  if (isGeminiEnabled()) {
    readinessState.ready = true;
    readinessState.lastError = null;
    readinessState.checkedAt = new Date().toISOString();
    console.log(`✨ Gemini API is configured and ready (${process.env.GEMINI_MODEL || 'gemini-1.5-flash'})`);
    return { ready: true, model: process.env.GEMINI_MODEL || 'gemini-1.5-flash', provider: 'gemini' };
  }

  if (readinessState.ready) {
    return { ready: true, model: OLLAMA_CONFIG.model, checkedAt: readinessState.checkedAt };
  }

  if (readinessState.startupPromise) {
    return readinessState.startupPromise;
  }

  readinessState.startupPromise = (async () => {
    try {
      // 1. Start Ollama serve if it is not running
      await startOllamaServe();

      // 2. Ensure model is installed (pull if missing)
      await ensureModelInstalled();

      // 3. Warm the model
      await activateModel();
      await generate('Reply with READY only.', { maxTokens: 16, temperature: 0 });

      readinessState.ready = true;
      readinessState.lastError = null;
      readinessState.checkedAt = new Date().toISOString();
      console.log('LLaMA 3.2 is running and ready for requests');
      return { ready: true, model: OLLAMA_CONFIG.model, checkedAt: readinessState.checkedAt };
    } catch (error) {
      readinessState.ready = false;
      readinessState.lastError = error.message;
      readinessState.checkedAt = new Date().toISOString();
      throw error;
    } finally {
      readinessState.startupPromise = null;
    }
  })();

  return readinessState.startupPromise;
}

function getReadinessState() {
  return { ...readinessState, startupPromise: !!readinessState.startupPromise };
}

/**
 * Send a prompt to Ollama and get a response
 * @param {string} prompt - The prompt to send
 * @param {object} options - Optional settings (temperature, max_tokens, etc.)
 * @returns {Promise<string>} - The LLM response text
 */
async function generate(prompt, options = {}) {
  if (isGeminiEnabled()) {
    return callGeminiApi(prompt, options.systemPrompt, options);
  }

  const { temperature = 0.7, maxTokens = 1024, systemPrompt = null } = options;

  const requestBody = {
    model: OLLAMA_CONFIG.model,
    prompt: prompt,
    stream: false,
    options: {
      temperature,
      num_predict: maxTokens
    }
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(requestBody);

    const req = http.request({
      hostname: OLLAMA_CONFIG.host,
      port: OLLAMA_CONFIG.port,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: OLLAMA_CONFIG.timeout
    }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.response) {
            resolve(parsed.response);
          } else if (parsed.error) {
            reject(new Error(`Ollama error: ${parsed.error}`));
          } else {
            resolve(data);
          }
        } catch (e) {
          resolve(data); // Return raw data if JSON parsing fails
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Ollama connection failed: ${e.message}. Is Ollama running?`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Chat-style interaction with Ollama
 * @param {Array} messages - Array of {role: 'user'|'assistant'|'system', content: string}
 * @param {object} options - Optional settings
 * @returns {Promise<string>} - The LLM response text
 */
async function chat(messages, options = {}) {
  if (isGeminiEnabled()) {
    return callGeminiChat(messages, options);
  }

  const { temperature = 0.7, maxTokens = 1024 } = options;

  const requestBody = {
    model: OLLAMA_CONFIG.model,
    messages: messages,
    stream: false,
    options: {
      temperature,
      num_predict: maxTokens
    }
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(requestBody);

    const req = http.request({
      hostname: OLLAMA_CONFIG.host,
      port: OLLAMA_CONFIG.port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: OLLAMA_CONFIG.timeout
    }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.message?.content) {
            resolve(parsed.message.content);
          } else if (parsed.error) {
            reject(new Error(`Ollama error: ${parsed.error}`));
          } else {
            resolve(data);
          }
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Ollama connection failed: ${e.message}. Is Ollama running?`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Check if Ollama is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (isGeminiEnabled()) {
    return !!process.env.GEMINI_API_KEY;
  }

  return new Promise((resolve) => {
    const req = http.request({
      hostname: OLLAMA_CONFIG.host,
      port: OLLAMA_CONFIG.port,
      path: '/api/tags',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Generate with retry logic
 * @param {string} prompt 
 * @param {object} options 
 * @returns {Promise<string>}
 */
async function generateWithRetry(prompt, options = {}) {
  let lastError;
  for (let i = 0; i <= OLLAMA_CONFIG.maxRetries; i++) {
    try {
      return await generate(prompt, options);
    } catch (e) {
      lastError = e;
      if (i < OLLAMA_CONFIG.maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }
  throw lastError;
}

/**
 * Get model info
 * @returns {Promise<object>}
 */
async function getModelInfo() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: OLLAMA_CONFIG.host,
      port: OLLAMA_CONFIG.port,
      path: '/api/tags',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const model = parsed.models?.find(m => m.name.startsWith(OLLAMA_CONFIG.model));
          resolve(model || { name: OLLAMA_CONFIG.model, available: false });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  generate,
  generateWithRetry,
  chat,
  isAvailable,
  getModelInfo,
  ensureReady,
  getReadinessState,
  config: OLLAMA_CONFIG
};
