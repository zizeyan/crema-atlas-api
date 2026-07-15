import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadOpenRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  if (process.env.OPENROUTER_KEY) return process.env.OPENROUTER_KEY.trim();
  try {
    return readFileSync(join(process.cwd(), 'cafe-ai', 'api-key.txt'), 'utf8').trim();
  } catch {}
  try {
    return readFileSync(join(process.cwd(), 'api-key.txt'), 'utf8').trim();
  } catch {}
  return '';
}

const apiKey = loadOpenRouterKey();

const openrouter = createOpenAI({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey,
  headers: {
    'HTTP-Referer': process.env.SITE_URL || 'https://cafenotefinal.vercel.app',
    'X-Title': 'CREMA ATLAS · AI RECO',
  },
});

async function proxyImage(body) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.SITE_URL || 'https://cafenotefinal.vercel.app',
      'X-Title': 'CREMA ATLAS · AI RECO',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: 'OpenRouter image error' }));
  return new Response(JSON.stringify(data), {
    status: r.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function generateReco(body) {
  const { model, messages, temperature = 0.9, max_tokens = 600 } = body || {};
  const systemMsg = messages && messages.find(m => m.role === 'system');
  const userMsg = messages && messages.find(m => m.role === 'user');

  const opts = {
    model: openrouter.chat(model || 'tencent/hy3:free'),
    messages: [],
    temperature,
    max_tokens,
  };

  if (systemMsg?.content) opts.system = systemMsg.content;
  if (userMsg?.content) {
    opts.messages = [{ role: 'user', content: userMsg.content }];
  } else if (systemMsg?.content) {
    opts.messages = [{ role: 'user', content: systemMsg.content }];
  }

  const { text, usage, finishReason } = await generateText(opts);

  return new Response(JSON.stringify({
    id: `reco-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'tencent/hy3:free',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: finishReason || 'stop',
      },
    ],
    usage: usage || {},
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, HTTP-Referer, X-Title',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OpenRouter API Key not configured' }), { status: 500 });
  }

  try {
    const body = await request.json();
    const hasImage = Array.isArray(body.modalities) && body.modalities.includes('image');
    if (hasImage) return await proxyImage(body);
    return await generateReco(body);
  } catch (err) {
    console.error('[AIReco] handler error:', err);
    return new Response(JSON.stringify({ error: err.message || 'AI reco failed' }), { status: 500 });
  }
}

export const config = { runtime: 'nodejs' };
