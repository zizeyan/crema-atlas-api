# 荐杯司 · 智能推荐 — OpenRouter 接入文档

> 对应 `index.html` 尾部的 **v2.5 纯增量模块**（`<style id="aiRecoStyle">` + `<script id="aiRecoApp">`）。
> 本文写给「下一位实现者」（人或 AI）：照本文即可把荐签内容从本地演绎切到真实大模型，**全程不需要改 index.html 一行**。

---

## 0. TL;DR（三步接入）

1. 到 [openrouter.ai/keys](https://openrouter.ai/keys) 取一枚 API Key，本地测试时在浏览器控制台执行：
   `localStorage.setItem('OPENROUTER_KEY','sk-or-v1-xxxx')`
2. 把 **§5 参考适配器** 整段存为 `ai-reco-adapter.js`，在 `index.html` 的 `</body>` 之前追加
   `<script src="ai-reco-adapter.js"></script>`（或直接把整段贴进控制台）。
3. 控制台执行 `AIReco.refresh(); AIReco.open()` —— 荐签脚注 ENGINE 变为
   `OpenRouter · hunyuan · 云端调制`，即接入成功。断网 / 无 Key / 报错都会自动回退本地演绎，页面不会坏。

---

## 1. 现状与架构

- **现在（未接入）**：按钮「智能推荐」→ 跟随荐签，内容由 `composeLocal(cafe, seed)` 本地演绎生成，
  产品图为 `drawCupArt()` 程序化拉花示意。脚注显示 `本地演绎 · 待接 OpenRouter`。
- **接入后**：核心检测到 `window.AI_RECO_ADAPTER` 存在，即改走云端；本地演绎退居失败兜底。

```
点按钮 / 星环换店 / 手帖翻页
        │  (560ms 防抖 + seq 竞态丢弃)
        ▼
  currentCafe() ──► 命中会话缓存? ──是──► 直接渲染
        │否
        ▼
  window.AI_RECO_ADAPTER 存在?
        │是                                │否
        ▼                                  ▼
  generateText(hunyuan free)          composeLocal() 本地演绎
   └► parseProduct() 渲染文案
   └► generateImage(nano-banana free) 到货后淡入替换示意图
  （任一环失败 → 自动回退本地，脚注标「云端未应答 · 本地演绎」）
```

**输入永远是"当前选中的那家店"**：星环模式取 `Ring.list[Ring.focusK]`；手帖模式解析 `#dtIdx`（NO.0x / 0y）。
换店时荐签会自动"重酿"，因此**必须按店缓存**（核心已做，见 §7）。

---

## 2. 运行时契约（实现者只需交付这一个对象）

```js
window.AI_RECO_ADAPTER = {
  label:      'OpenRouter · hunyuan',   // 可选，荐签脚注显示用
  imageLabel: 'nano-banana',            // 可选，图片角签显示用

  /** 文案：返回"模型原始文本"（核心自己剥围栏、抓 JSON、裁剪校验） */
  async generateText({ cafe, system, prompt, model, signal }) -> Promise<string>,

  /** 生图（可选）：返回可直接塞进 <img src> 的 URL（https 或 data:image/... base64） */
  async generateImage({ cafe, product, prompt, model, signal }) -> Promise<string>
};
```

入参说明（全部由核心传入，适配器**不要**自己拼提示词）：

| 参数 | 说明 |
|---|---|
| `cafe` | 当前店铺对象：`id / name / short / en / note / feel[] / tags[] / rating / cost / business_area / address / tel / type / cityname / lng / lat` |
| `system` / `prompt` | 来自 `AIReco.buildTextPrompt(cafe)`，**提示词单一事实源在 index.html**（搜 `buildTextPrompt`），本文档 §3 给填充示例 |
| `model` | 来自 `AIReco.models`（`text` / `image` 两个 slug，见 §4） |
| `signal` | `AbortSignal`，换店/关签时核心会 abort，请透传给 `fetch` |
| `product` | 生图时传入的已解析文案 JSON（其中 `image_prompt` 若模型给了会优先使用） |

辅助 API（核心已暴露）：

```js
AIReco.models            // { text, image } —— 想换模型直接改这里即可，例：AIReco.models.text='xxx:free'
AIReco.buildTextPrompt(cafe)   // -> {system, user}
AIReco.buildImagePrompt(cafe, product)  // -> 英文生图提示词
AIReco.open() / close() / toggle()
AIReco.refresh()         // 清缓存 + 强制下次重酿（换 Key / 换模型后调用）
AIReco.product           // 最近一次渲染的产品 JSON
AIReco.cafe              // 当前选中店铺
```

### 产品 JSON schema（`generateText` 的文本会被解析成它；本地演绎也同构）

| 字段 | 约束 |
|---|---|
| `product_name` | 中文饮品名，≤7 字（解析时硬裁 10） |
| `en_name` | 英文名 ≤4 词 |
| `tagline` | 一句荐语 ≤16 字 |
| `description` | 两句，共 ≤70 字 |
| `flavor_tags` | 3 个风味标签数组，每个 ≤6 字（硬裁 4 个） |
| `pairing` | 佐点 ≤10 字 |
| `best_time` | 时段 ≤8 字 |
| `serve` | 冰/热 + 出杯描述 ≤12 字（含"冰"字会把取景器参数条切到 ICE） |
| `price_estimate` | 形如 `¥38`，贴近该店人均 |
| `image_prompt` | 给生图模型的英文提示词（可空，空则核心用 `buildImagePrompt` 补） |

---

## 3. 提示词（以 NO.02 Manner 滨江店为例的**实际填充结果**）

**system**

```
你是「杯中山海 · CREMA ATLAS」的驻站荐杯师。你的唯一输出是一个严格合法的 JSON 对象本体：不要 markdown、不要代码围栏、不要注释、不要任何 JSON 之外的文字。
```

**user**（由 `buildTextPrompt(cafe)` 注入店铺档案自动生成）

```
【任务】为下面这家上海咖啡店即兴设计一款「本店限定」推荐饮品，并按字段要求输出 JSON。
【店铺档案】
- 店名：Manner Coffee(滨江店)（MANNER · RIVERSIDE）
- 商圈：滨江 · 上海
- 评分：4.7 / 5.0；人均：¥28
- 标签：咖啡厅 / 自带杯
- 招牌气质：江景外摆 / 自带杯减五元 / 澳白醇厚
- 一句店志：江风、汽笛与一杯澳白，滨江的清醒时刻。
【口吻】简体中文；「沪上精品咖啡手帖」式的克制浪漫；可呼应店铺气质与商圈，但不得编造真实在售菜单、不得使用表情符号、不得夸大宣传。
【输出 JSON 字段】
product_name：中文饮品名，不超过 7 个字；
en_name：英文名，不超过 4 个单词；
tagline：一句荐语，不超过 16 字；
description：两句描述，共不超过 70 字；
flavor_tags：3 个风味标签组成的数组，每个不超过 6 字；
pairing：建议佐点，不超过 10 字；
best_time：建议时段，不超过 8 字；
serve：冰或热 + 一句出杯描述，不超过 12 字；
price_estimate：形如 "¥38"，需为贴近该店人均的合理单杯价；
image_prompt：给生图模型的英文提示词（一句话，描述这杯饮品的外观、杯型、光线与氛围）。
再次强调：只输出 JSON 对象本体。
```

**生图提示词模板**（`buildImagePrompt`，与整站甜点霓虹色板对齐）

```
Editorial product photograph of "<en_name>", a specialty coffee drink, elegant glass or
ceramic cup with delicate latte art and creamy microfoam, dark cocoa-plum studio backdrop,
soft neon rim light in strawberry pink and caramel gold with a faint mint glow, gentle steam,
shallow depth of field, appetizing, ultra detailed, clean composition, no text, no watermark, no people.
```

---

## 4. OpenRouter 调用细节

- **Endpoint**：`POST https://openrouter.ai/api/v1/chat/completions`（文案与生图共用；OpenRouter 支持浏览器直连 CORS）
- **Headers**：
  - `Authorization: Bearer <KEY>`（必填）
  - `Content-Type: application/json`
  - `HTTP-Referer: <你的站点URL>`、`X-Title: CREMA ATLAS · AI RECO`（可选，用于 OpenRouter 归因排行）

### 模型（测试期免费档 —— **slug 请以 openrouter.ai/models 实时为准**）

| 用途 | 缺省 slug（写在 index.html 的 `AI_MODELS`） | 备注 |
|---|---|---|
| 文案 | `tencent/hunyuan-a13b-instruct:free` | 需求口径为"腾讯 hy3 免费档"。撰写本档时混元免费档为该 slug；若官网已上架混元 3 系免费档（形如 `tencent/hunyuan-3-*:free`），在官网搜 **hunyuan** 取当前 `:free` slug，运行时 `AIReco.models.text='新slug'` 或改 `AI_MODELS` 即可 |
| 生图 | `google/gemini-2.5-flash-image-preview:free` | 即 **Nano Banana** 免费档；若 slug 去掉 `-preview` 或改名，同样以官网搜 **nano banana / gemini flash image** 为准 |

### 文案请求 / 响应

```jsonc
// 请求体
{
  "model": "tencent/hunyuan-a13b-instruct:free",
  "messages": [
    { "role": "system", "content": "<buildTextPrompt().system>" },
    { "role": "user",   "content": "<buildTextPrompt().user>" }
  ],
  "temperature": 0.9,
  "max_tokens": 600
}
```

取 `choices[0].message.content` 原样返回给核心即可（**不必**自己 JSON.parse——核心的 `parseProduct`
会剥 ```json 围栏、截取首个 `{...}`、逐字段裁剪校验；解析失败自动回退本地演绎）。

### 生图请求 / 响应（OpenRouter 图像输出规范）

```jsonc
// 请求体：关键是 modalities
{
  "model": "google/gemini-2.5-flash-image-preview:free",
  "messages": [ { "role": "user", "content": "<image_prompt>" } ],
  "modalities": ["image", "text"]
}
```

图片在 `choices[0].message.images[0].image_url.url`，为 `data:image/png;base64,...` 的 data URL，
直接 return 给核心即可（核心会淡入替换程序化拉花示意图，并把角签改成 `AI 生成 · nano-banana`）。
字段缺失时 return 空字符串——核心保留示意图，不算失败。

---

## 5. 参考适配器全文（`ai-reco-adapter.js`，可直接落盘或贴控制台）

```js
/* ai-reco-adapter.js — 杯中山海 · 荐杯司 OpenRouter 适配器（参考实现 v1） */
(function(){
  'use strict';
  const CFG = {
    /* 走代理时设 window.AI_RECO_PROXY = 'https://xxx.workers.dev'（见 §6），否则直连 */
    base : (window.AI_RECO_PROXY || 'https://openrouter.ai/api/v1'),
    key  : function(){ return window.OPENROUTER_KEY || localStorage.getItem('OPENROUTER_KEY') || ''; },
    site : location.origin,                    /* HTTP-Referer 归因，可改成正式域名 */
    title: 'CREMA ATLAS · AI RECO'
  };
  function headers(){
    const h = { 'Content-Type':'application/json' };
    const k = CFG.key();
    if (k) h['Authorization'] = 'Bearer ' + k;   /* 走代理时可无 Key，由代理注入 */
    h['HTTP-Referer'] = CFG.site;
    h['X-Title'] = CFG.title;
    return h;
  }
  async function chat(body, signal){
    const res = await fetch(CFG.base + '/chat/completions', {
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
        model: o.model || (window.AIReco && window.AIReco.models.text) || 'tencent/hunyuan-a13b-instruct:free',
        messages: [ {role:'system',content:o.system}, {role:'user',content:o.prompt} ],
        temperature: 0.9, max_tokens: 600
      }, o.signal);
      const m = j.choices && j.choices[0] && j.choices[0].message;
      const txt = m && (typeof m.content==='string' ? m.content
                 : Array.isArray(m.content) ? m.content.map(p=>p.text||'').join('') : '');
      if (!txt) throw new Error('OpenRouter: 空响应');
      return txt;                       /* 原样返回，解析交给核心 parseProduct */
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
  console.info('[AIReco] OpenRouter 适配器已注入：', window.AI_RECO_ADAPTER.label,
               CFG.key() ? '(Key 就绪)' : '(尚未注入 Key：localStorage.setItem("OPENROUTER_KEY","sk-or-..."))');
})();
```

---

## 6. 安全与上线

- **绝不**把 Key 写进公开仓库或公开站点源码。测试期只用
  `localStorage.setItem('OPENROUTER_KEY', 'sk-or-v1-...')` 手动注入本机。
- 上线请走**服务端代理**，Key 留在服务端。5 分钟版 Cloudflare Worker（把
  `OPENROUTER_KEY` 存为 Worker 密钥，前端设 `window.AI_RECO_PROXY='https://xxx.workers.dev'`）：

```js
export default {
  async fetch(req, env){
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + env.OPENROUTER_KEY },
      body: req.body
    });
    const res = new Response(r.body, r);
    Object.entries(cors()).forEach(([k,v]) => res.headers.set(k,v));
    return res;
  }
};
function cors(){ return {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization, HTTP-Referer, X-Title',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
}; }
```

（该 Worker 忽略路径、只转发 chat/completions —— 与 §5 适配器的 `base + '/chat/completions'` 拼法兼容。）

---

## 7. 核心已内建的行为（适配器**不需要**重复实现）

| 行为 | 参数 |
|---|---|
| 换店防抖 | 560ms（打开瞬间 120ms 快酿） |
| 竞态丢弃 | `seq` 序号，旧请求返回即弃 |
| 请求中断 | 每次重酿 `AbortController.abort()` 上一单，`signal` 已透传 |
| 按店缓存 | `Map<cafe.id, {p, img}>`，会话级；7 家店最多 7 文 + 7 图（免费额度友好） |
| 超时 | 文案 22s / 生图 34s |
| 失败兜底 | 任一环异常 → `composeLocal` 本地演绎，脚注标 `云端未应答 · 本地演绎` |
| 熔断 | 模块自身连续异常 60 帧即静默停摆，绝不影响主站 |

---

## 8. 联调验收清单

- [ ] 滚到「探」章：右下角浮现「智能推荐」按钮（悬浮呼吸、霓虹描边流转、糖晶闪烁；与选择台横向相撞时自动升至其上缘）
- [ ] 点击按钮：液态玻璃荐签**延迟跟随**指针（近右/下缘自动翻侧），内容含「产品推荐」头签、饮品名/英文名/荐语/描述/风味签/佐点/时段/出杯/预估价 + 拉花示意图
- [ ] 荐签开着时**拖拽星环换店**：约 0.56s 后自动重酿为新店内容
- [ ] 「展开手记」进入详情：同款按钮仍在右下角；`‹ ›` 翻店同样自动重酿；Esc 先收荐签、再收手帖
- [ ] 注入 Key + 适配器后：ENGINE 变 `OpenRouter · hunyuan · 云端调制`，文案来自云端；图片到货后淡入替换示意图、角签变 `AI 生成 · nano-banana`
- [ ] 拔网线 / 删 Key：自动回退本地演绎，脚注标 `云端未应答 · 本地演绎`，页面无报错
- [ ] `prefers-reduced-motion`：无闪烁、无漂浮、荐签直贴指针位（不拖尾）
- [ ] 触屏设备：荐签停靠按钮上方右侧，不跟随

## 9. FAQ

- **CORS 报错？** OpenRouter 官方支持浏览器直连；若公司网络拦截，改走 §6 代理。
- **429 / 免费额度用尽？** `:free` 档有分钟级与日级限速；核心按店缓存已把用量压到最低，仍超限时等额度恢复或换非 free slug。
- **模型返回不是纯 JSON？** 核心 `parseProduct` 会剥围栏并截取首个 `{...}`；仍失败自动回退本地，无需处理。
- **想换模型？** 运行时 `AIReco.models.text = '...'; AIReco.models.image = '...'; AIReco.refresh()`；或改 `index.html` 内 `AI_MODELS` 常量（搜索 `AI_MODELS`）。
- **模型下架 / slug 变了？** 一切以 openrouter.ai/models 搜索结果为准，本文 §4 的 slug 只是撰写时的缺省值。
