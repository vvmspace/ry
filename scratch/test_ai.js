const ai = require('./src/libs/abstract-ai');

async function test() {
  try {
    console.log('Testing gemma-4-31b-it...');
    // We don't want to actually call the API, so we'll mock callGemini and callOpenRouter
    const originalCallGemini = ai.callGemini;
    const originalCallOpenRouter = ai.callOpenRouter;

    ai.callGemini = async (name) => { console.log('Mocked callGemini called with:', name); return 'gemini_result'; };
    ai.callOpenRouter = async (name) => { console.log('Mocked callOpenRouter called with:', name); return 'or_result'; };

    await ai.callModel('gemma-4-31b-it', 'prompt');

    ai.callGemini = originalCallGemini;
    ai.callOpenRouter = originalCallOpenRouter;
  } catch (err) {
    console.error(err);
  }
}

test();
