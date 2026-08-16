const fs = require('fs');
const path = require('path');
const llmService = require('../agents/langgraph/llmService');

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const base = path.basename(filePath);
      if (base !== 'node_modules' && base !== 'dist' && base !== '.git' && base !== '.vscode' && base !== 'build') {
        scanDirectory(filePath, fileList);
      }
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.ts', '.tsx', '.json', '.css', '.md', '.html'].includes(ext)) {
        if (path.basename(filePath) !== 'package-lock.json') {
          fileList.push(filePath);
        }
      }
    }
  }
  return fileList;
}

let cachedCorpus = null;

function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text = '') {
  return normalize(text)
    .split(' ')
    .filter(token => token.length > 2);
}

function chunkDocument(content, source) {
  const lines = content.split(/\r?\n/);
  const chunks = [];
  let current = [];
  let heading = 'overview';

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) || /^\*\*.+\*\*$/.test(line) || /^##\s+/.test(line)) {
      if (current.length > 0) {
        chunks.push({ source, heading, text: current.join('\n').trim() });
        current = [];
      }
      heading = line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim();
    }
    if (line.trim()) current.push(line);
    if (current.length >= 18) {
      chunks.push({ source, heading, text: current.join('\n').trim() });
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push({ source, heading, text: current.join('\n').trim() });
  }

  return chunks.filter(chunk => chunk.text.length > 40);
}

function loadCorpus() {
  if (cachedCorpus) return cachedCorpus;

  const corpus = [];
  const projectRoot = path.resolve(__dirname, '../..');
  
  // 1. Scan root directory for markdown files
  let rootFiles = [];
  try {
    rootFiles = fs.readdirSync(projectRoot)
      .map(f => path.join(projectRoot, f))
      .filter(f => fs.statSync(f).isFile() && path.extname(f).toLowerCase() === '.md');
  } catch (e) {}

  // 2. Scan server directory for backend code files
  const serverDir = path.resolve(projectRoot, 'server');
  const serverFiles = scanDirectory(serverDir);
  
  // 3. Scan client src directory for frontend code files
  const clientSrcDir = path.resolve(projectRoot, 'client/src');
  const clientFiles = scanDirectory(clientSrcDir);
  
  const allFiles = [...new Set([...rootFiles, ...serverFiles, ...clientFiles])];
  console.log(`[RAG Scanner] Scanning project files... Found ${allFiles.length} files to index.`);
  
  for (const filePath of allFiles) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      corpus.push(...chunkDocument(content, path.basename(filePath)));
    } catch (e) {
      console.warn(`[RAG Scanner] Error reading file ${filePath}: ${e.message}`);
    }
  }

  cachedCorpus = corpus;
  console.log(`[RAG Scanner] Indexing complete! Created ${corpus.length} chunks.`);
  return cachedCorpus;
}

function scoreChunk(questionTokens, chunkText, source = '') {
  const chunkTokens = new Set(tokenize(chunkText));
  let score = 0;
  for (const token of questionTokens) {
    if (chunkTokens.has(token)) score += 1;
  }

  if (source) {
    const sourceLower = source.toLowerCase();
    for (const token of questionTokens) {
      if (token.length > 3 && sourceLower.includes(token)) {
        score += 10;
      }
    }
  }

  return score;
}

function getTopChunks(question, limit = 4) {
  const corpus = loadCorpus();
  const questionTokens = tokenize(question);

  return corpus
    .map(chunk => ({
      ...chunk,
      score: scoreChunk(questionTokens, `${chunk.source}\n${chunk.heading}\n${chunk.text}`, chunk.source)
    }))
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .slice(0, limit);
}

function shouldUseDocsQa(message = '') {
  const text = normalize(message);
  return /\b(project|app|busgo|architecture|stack|tech|run|start|setup|feature|agent|agents|model|ollama|database|db|safe|security|ports|booking flow|how does|what does|what is this|what can you do|rule based|ruled based|rulebased|how are you working|how it works|working model|scan|code|file|folder|directory|repository|implementation|function|class|source|line|postgres|pg|sql|js|ts|tsx|json|css|html|md|readme)\b/.test(text);
}

async function answerProjectQuestion(message = '') {
  if (!shouldUseDocsQa(message)) return null;

  const chunks = getTopChunks(message, 5);
  if (chunks.length === 0) return null;

  const context = chunks
    .map((chunk, index) => `[${index + 1}] Source: ${chunk.source} :: ${chunk.heading}\n${chunk.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You answer questions about the BusGo project using the provided documentation only.
Return a concise, direct answer in 1-4 sentences.
If the documentation does not contain the answer, say you do not know.
Do not mention that you are using retrieved context.`;

  const prompt = `Question: ${message}\n\nDocumentation context:\n${context}`;

  const raw = await llmService.generate(prompt, {
    systemPrompt,
    temperature: 0.2,
    maxTokens: 250
  });

  return {
    answer: raw.trim(),
    sources: chunks.map(chunk => ({ source: chunk.source, heading: chunk.heading, score: chunk.score }))
  };
}

module.exports = { answerProjectQuestion, shouldUseDocsQa };
