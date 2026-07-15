/* ai-reco-adapter.js — 杯中山海 · 荐杯司 OpenRouter 适配器（Vercel 后端代理版） */
(function(){
  'use strict';
  const CFG = {
    base: (window.AI_RECO_PROXY || window.location.origin + '/api/chat/completions').replace(/\/+$/, ''),
    site: location.origin,
    title: 'CREMA ATLAS · AI RECO'
  };
  function endpoint(){
    return /\/chat\/completions$/i.test(CFG.base) ? CFG.base : CFG.base + '/chat/completions';
  }
  function headers(){
    const h = { 'Content-Type':'application/json' };
    h['HTTP-Referer'] = CFG.site;
    h['X-Title'] = CFG.title;
    return h;
  }
  async function chat(body, signal){
    const res = await fetch(endpoint(), {
      method:'POST', headers:headers(), body:JSON.stringify(body), signal:signal
    });
    if (!res.ok){
      const t = await res.text().catch(()=>String(res.status));
      throw new Error('OpenRouter ' + res.status + ': ' + t.slice(0,300));
    }
    return res.json();
  }
  window.AI_RECO_ADAPTER = {
    label: 'OpenRouter · hunyuan',
    imageLabel: 'nano-banana',
    async generateText(o){
      const j = await chat({
        model: o.model || (window.AIReco && window.AIReco.models.text) || 'tencent/hy3:free',
        messages: [ {role:'system',content:o.system}, {role:'user',content:o.prompt} ],
        temperature: 0.9, max_tokens: 600
      }, o.signal);
      const m = j.choices && j.choices[0] && j.choices[0].message;
      const txt = m && (typeof m.content==='string' ? m.content
                 : Array.isArray(m.content) ? m.content.map(p=>p.text||'').join('') : '');
      if (!txt) throw new Error('OpenRouter: 空响应');
      return txt;
    },
    async generateImage(o){
      const j = await chat({
        model: o.model || (window.AIReco && window.AIReco.models.image) || 'google/gemini-2.5-flash-image-preview:free',
        messages: [ {role:'user',content:o.prompt} ],
        modalities: ['image','text']
      }, o.signal);
      const m = j.choices && j.choices[0] && j.choices[0].message;
      return (m && m.images && m.images[0] && m.images[0].image_url && m.images[0].image_url.url) || '';
    }
  };
  console.info('[AIReco] OpenRouter 适配器已注入：', window.AI_RECO_ADAPTER.label, '(Vercel 后端代理)');
})();
