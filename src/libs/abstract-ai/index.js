'use strict';

const fs = require('fs');
const path = require('path');

class AbstractAI {
  constructor() {
    this.keys = {
      gemini: (process.env.GEMINI_API_KEY || '').split(',').filter(Boolean).map(s => s.trim()),
      openrouter: (process.env.OPENROUTER_API_KEY || '').split(',').filter(Boolean).map(s => s.trim()),
      openai: (process.env.OPENAI_API_KEY || '').split(',').filter(Boolean).map(s => s.trim()),
      local: (process.env.LOCAL_LLM_API_KEY || '').split(',').filter(Boolean).map(s => s.trim()),
    };
    this.localUrl = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/v1'; // Default local URL
  }

  getRandomKey(provider) {
    const list = this.keys[provider];
    if (!list || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  async ask(prompt, models = 'gemma,gemini-2.5-flash', variables = {}, systemInstruction = null, responseFormat = null, schema = null) {
    const modelList = models.split(',').filter(model => model !== 'local' ? true : !!process.env.LOCAL_LLM_API_KEY).map(m => m.trim());
    const finalPrompt = this.replaceVariables(prompt, variables);

    for (const modelIdent of modelList) {
      try {
        console.log(`[AbstractAI] Trying model: ${modelIdent}`);
        const response = await this.callModel(modelIdent, finalPrompt, systemInstruction, responseFormat, schema);
        if (response) return response;
      } catch (err) {
        console.error(`[AbstractAI] Error with model ${modelIdent}:`, err.message);
      }
    }
    throw new Error(`[AbstractAI] All models failed: ${models}`);
  }

  async json(prompt, exampleOrSchema, models = 'gemma,gemini-2.5-flash', variables = {}) {
    let jsonPrompt = prompt;
    let schema = null;
    const systemInstruction = 'You are a precise JSON extractor. Return ONLY valid JSON. No reasoning, no chatter, no markdown code blocks. Your response will be parsed automatically. Start your response with { and end with }.';

    if (exampleOrSchema) {
      if (exampleOrSchema.type) {
        // If it looks like a schema (OpenAPI type)
        schema = exampleOrSchema;
      } else {
        // If it's just an example object
        const formatHint = typeof exampleOrSchema === 'object'
          ? JSON.stringify(exampleOrSchema, null, 2)
          : exampleOrSchema;
        jsonPrompt += `\n\nREQUIRED JSON FORMAT:\n${formatHint}`;
      }
    }

    const response = await this.ask(jsonPrompt, models, variables, systemInstruction, 'json', schema);
    try {
      return this.parseJsonFromResponse(response);
    } catch (err) {
      console.error('[AbstractAI] Failed to parse JSON. Response was:', response);
      throw new Error('[AbstractAI] Response is not valid JSON');
    }
  }

  /**
   * Extract and parse JSON from AI response text.
   * Handles markdown code blocks, extra text before/after JSON, etc.
   */
  parseJsonFromResponse(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('Empty or invalid response');
    }

    // 1. Initial trim
    let cleaned = response.trim();

    // 2. Remove markdown code blocks if they exist (```json ... ``` or ``` ... ```)
    cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // 3. Find the most likely JSON object or array by locating balanced braces/brackets
    const startBracket = cleaned.indexOf('{');
    const startSquare = cleaned.indexOf('[');
    const endBracket = cleaned.lastIndexOf('}');
    const endSquare = cleaned.lastIndexOf(']');

    let start = -1;
    let end = -1;

    // Prefer {} for objects, [] for arrays - pick the outermost valid pair
    if (startBracket !== -1 && (startSquare === -1 || startBracket < startSquare)) {
      start = startBracket;
      end = endBracket;
    } else if (startSquare !== -1) {
      start = startSquare;
      end = endSquare;
    }

    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    // 4. Try to parse the extracted JSON
    return JSON.parse(cleaned);
  }

  replaceVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`%${key}%`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  async callModel(modelIdent, prompt, systemInstruction, responseFormat, schema) {
    const lowIdent = modelIdent.toLowerCase();

    // Mapping identifiers to provider:model
    if (lowIdent === 'gemma' || lowIdent.includes('gemma-4')) {
      // Map gemma variants to Google Gemini API to use free tier
      // If it's just 'gemma', use the top 31B model
      const modelName = lowIdent === 'gemma' ? 'gemma-4-31b-it' : modelIdent;
      return this.callGemini(modelName, prompt, systemInstruction, responseFormat, schema);
    }

    if (lowIdent.startsWith('gemini')) {
      return this.callGemini(modelIdent, prompt, systemInstruction, responseFormat, schema);
    }

    if (lowIdent === 'local') {
      return this.callOpenAI(modelIdent, prompt, this.localUrl, this.getRandomKey('local'), systemInstruction, responseFormat);
    }

    if (modelIdent.includes(':')) {
      const [provider, modelName] = modelIdent.split(':');
      if (provider === 'openrouter') return this.callOpenRouter(modelName, prompt, systemInstruction, responseFormat);
      if (provider === 'openai') return this.callOpenAI(modelName, prompt, undefined, undefined, systemInstruction, responseFormat);
      if (provider === 'gemini') return this.callGemini(modelName, prompt, systemInstruction, responseFormat, schema);
    }

    // Default fallback: Try as OpenRouter model name (with safety 1000 token limit inside callOpenRouter)
    return this.callOpenRouter(modelIdent, prompt, systemInstruction, responseFormat);
  }

  async callGemini(modelName, prompt, systemInstruction, responseFormat, schema = null) {
    const key = this.getRandomKey('gemini');
    if (!key) throw new Error('No Gemini API key found');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 8192 // Correct field name for Gemini REST API
      }
    };

    if (systemInstruction) {
      body.system_instruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (responseFormat === 'json') {
      body.generationConfig.response_mime_type = "application/json";
      if (schema) {
        body.generationConfig.response_schema = schema;
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });


    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log(data?.candidates?.[0]?.content?.parts);
    return data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  async callOpenRouter(modelName, prompt, systemInstruction, responseFormat) {
    const key = this.getRandomKey('openrouter');
    if (!key) throw new Error('No OpenRouter API key found');

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    return this.callOpenAICompatible(url, key, modelName, prompt, systemInstruction, responseFormat);
  }

  async callOpenAI(modelName, prompt, url = 'https://api.openai.com/v1/chat/completions', key = this.getRandomKey('openai'), systemInstruction, responseFormat) {
    if (!key && !url.includes('localhost') && !url.includes('127.0.0.1')) throw new Error('No OpenAI API key found');
    return this.callOpenAICompatible(url, key, modelName, prompt, systemInstruction, responseFormat);
  }

  async callOpenAICompatible(url, key, modelName, prompt, systemInstruction, responseFormat) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const body = {
      model: modelName,
      messages: [],
      max_tokens: 1000, // Reasonable limit to avoid 402 errors on OpenRouter
    };

    if (systemInstruction) {
      body.messages.push({ role: 'system', content: systemInstruction });
    }
    body.messages.push({ role: 'user', content: prompt });

    if (responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content;
  }
}

module.exports = new AbstractAI();
