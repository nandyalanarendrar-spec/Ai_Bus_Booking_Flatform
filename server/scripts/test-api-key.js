require('dotenv').config();
const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!apiKey) {
  console.log('❌ No GEMINI_API_KEY found in .env');
  process.exit(1);
}

console.log('🔍 Testing Gemini API Key...');
console.log(`   Key starts with: ${apiKey.substring(0, 8)}...`);
console.log(`   Model: ${model}`);
console.log('');

const postData = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text: 'Say "API KEY WORKS!" in exactly 3 words.' }] }],
  generationConfig: { temperature: 0, maxOutputTokens: 20 }
});

const req = https.request({
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  timeout: 15000
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log('✅ API KEY IS WORKING PERFECTLY!');
        console.log(`   Gemini says: "${parsed.candidates[0].content.parts[0].text.trim()}"`);
        console.log('');
        console.log('🎉 Your chatbot AI is ready to use!');
      } else if (parsed.error) {
        const code = parsed.error.code;
        const msg = parsed.error.message;
        console.log('❌ API KEY FAILED!');
        console.log(`   Error ${code}: ${msg}`);
        console.log('');
        if (code === 400 && msg.includes('API_KEY_INVALID')) {
          console.log('👉 FIX: Your key is invalid. Copy the correct key from https://aistudio.google.com/apikey');
          console.log('   The correct key starts with "AIza..."');
        } else if (code === 403) {
          console.log('👉 FIX: API access denied. Make sure billing or free tier is active.');
        } else if (code === 404) {
          console.log('👉 FIX: Model not found. Change GEMINI_MODEL=gemini-1.5-flash in .env');
        }
      } else {
        console.log('⚠️  Unexpected response:', data.substring(0, 200));
      }
    } catch (e) {
      console.log('⚠️  Could not parse response:', data.substring(0, 200));
    }
  });
});

req.on('error', err => {
  console.log('❌ Network error:', err.message);
});
req.on('timeout', () => {
  req.destroy();
  console.log('❌ Request timed out - check your internet connection');
});

req.write(postData);
req.end();
