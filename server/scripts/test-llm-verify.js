const { validateBookingSuggestion } = require('../services/llmVerifier');

(async () => {
  try {
    const sample = {
      scheduleId: 1,
      seats: ['S1','S2'],
      totalPrice: 800
    };
    console.log('Testing LLM verifier with sample suggestion:', sample);
    const result = await validateBookingSuggestion(sample, 1);
    console.log('Verifier result:', result);
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
})();
