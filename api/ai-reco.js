/**
 * 荐杯司 · AI 推荐后端（Vercel AI SDK + OpenRouter）
 *
 * 为 cafe-ai 前端 v2.5 的 AI_RECO_PROXY 提供同域代理：
 *   - 文本推荐：走 Vercel AI SDK 的 generateText，返回 OpenAI 兼容格式
 *   - 产品生图：含 modalities 时直接转发 OpenRouter，由后端注入 API Key
 * 这样 OpenRouter Key 不会暴露给浏览器。
 */
const { createOpenAI } = require('@ai-sdk/openai');
const { generateText } = require('ai');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

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
    'HTTP-Referer': process.env.SITE_URL || 'https://crema-atlas-api.vercel.app',
    'X-Title': 'CREMA ATLAS · AI RECO',
  },
});

async function proxyImage(body, res) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.SITE_URL || 'https://crema-atlas-api.vercel.app',
      'X-Title': 'CREMA ATLAS · AI RECO',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: 'OpenRouter image error' }));
  res.status(r.status).json(data);
}

async function generateReco(req, res) {
  const body = req.body || {};
  const { model, messages, temperature = 0.9, max_tokens = 600 } = body;
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

  res.json({
    id: `reco-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'tencent/hunyuan-a13b-instruct:free',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: finishReason || 'stop',
      },
    ],
    usage: usage || {},
  });
}

module.exports = async function aiRecoHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, HTTP-Referer, X-Title');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API Key not configured' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const cloned = req.body;
    const hasImage = Array.isArray(cloned.modalities) && cloned.modalities.includes('image');
    if (hasImage) return await proxyImage(cloned, res);
    return await generateReco(req, res);
  } catch (err) {
    console.error('[AIReco] handler error:', err);
    res.status(500).json({ error: err.message || 'AI reco failed' });
  }
};
