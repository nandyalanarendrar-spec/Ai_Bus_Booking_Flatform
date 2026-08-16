const http = require('http');
const { spawn } = require('child_process');

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT || 11434);
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const BASE_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(pathname, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: pathname,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          : undefined,
        timeout: 5000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, data });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out connecting to ${BASE_URL}${pathname}`));
    });

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

async function isOllamaReady() {
  try {
    const response = await request('/api/tags');
    return response.statusCode === 200;
  } catch {
    return false;
  }
}

async function waitForOllama(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isOllamaReady()) {
      return true;
    }
    await delay(1000);
  }

  return false;
}

function runOllamaCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ollama', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ollama ${args.join(' ')} failed: ${stderr || stdout || `exit ${code}`}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function startOllamaServe() {
  if (await isOllamaReady()) {
    return;
  }

  try {
    const serveProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    serveProcess.unref();
    console.log(`Starting Ollama on ${BASE_URL}...`);
  } catch (error) {
    console.warn(`Ollama CLI is unavailable: ${error.message}`);
    return;
  }

  const ready = await waitForOllama();
  if (!ready) {
    console.warn(`Ollama did not become ready at ${BASE_URL} within the startup window.`);
  }
}

async function ensureModel() {
  if (!(await isOllamaReady())) {
    return;
  }

  try {
    const response = await request('/api/tags');
    const parsed = JSON.parse(response.data || '{}');
    const modelExists = Array.isArray(parsed.models) && parsed.models.some((model) => {
      const name = typeof model?.name === 'string' ? model.name : '';
      return name === MODEL || name.startsWith(`${MODEL}:`);
    });

    if (!modelExists) {
      console.log(`Pulling ${MODEL} for Ollama...`);
      await runOllamaCommand(['pull', MODEL]);
    }

    console.log(`Warming ${MODEL}...`);
    await runOllamaCommand(['run', MODEL, 'Respond with READY only.']);
  } catch (error) {
    console.warn(`Could not fully prepare ${MODEL}: ${error.message}`);
  }
}

async function main() {
  try {
    await startOllamaServe();
    await ensureModel();
    console.log(`Ollama bootstrap complete for ${MODEL} at ${BASE_URL}.`);
  } catch (error) {
    console.warn(`Ollama bootstrap skipped: ${error.message}`);
  }
}

main();