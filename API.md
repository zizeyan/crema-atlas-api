# 杯中山海 · 咖啡馆数据 API 接入文档（预留）

前端已完成解耦，本文档定义后端需要实现的 REST 接口。按此实现后**无需改动任何前端代码**，注入一个变量即可切换到远程数据。

## 1. 前端接入方式

前端的加载顺序为三级回退：

```
window.SITE_API_BASE（远程 API） → ./data/cafes.json（本地文件） → 内嵌 SEED（页面内置）
```

部署后在 `index.html` 的应用脚本之前注入：

```html
<script>window.SITE_API_BASE = 'https://api.your-domain.com';</script>
```

前端启动时会请求 `GET {SITE_API_BASE}/api/cafes`，成功即用远程数据重建筛选器与卡片；失败自动回退，页面不会白屏。

## 2. 通用约定

| 项 | 约定 |
|---|---|
| 协议 | HTTPS，UTF-8，`Content-Type: application/json` |
| 鉴权 | 写操作建议 `Authorization: Bearer <token>`（读操作可公开） |
| 响应包 | 所有接口统一信封结构（见下） |
| CORS | 需允许站点域名的 `GET, POST, PUT, DELETE, OPTIONS` 与 `Content-Type, Authorization` 头 |

统一响应信封：

```json
{ "code": 0, "msg": "ok", "data": { } }
```

`code = 0` 表示成功；非 0 见错误码表。列表类接口的 `data` 结构：

```json
{ "list": [ Cafe ], "page": 1, "size": 20, "total": 7 }
```

> 兼容说明：前端也接受直接返回 `Cafe[]` 数组的极简实现（无信封），但推荐信封结构以便扩展。

## 3. Cafe 数据模型

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | number | 是 | 唯一标识（服务端生成） |
| name | string | 是 | 完整店名，可含「(分店)」括注 |
| address | string | 是 | 详细地址 |
| location | string | 是 | `"经度,纬度"`，GCJ-02（高德）坐标系 |
| tel | string | 否 | 电话，前端用于 `tel:` 拨号 |
| business_area | string | 是 | 商圈，前端据此生成筛选器 |
| type | string | 是 | 类型（如「咖啡厅」） |
| tags | string[] | 否 | 标签数组 |
| rating | string | 是 | 评分，如 `"4.7"` |
| cost | string | 是 | 人均，如 `"58.00"` |
| image_url | string | 否 | 图片直链；加载失败时前端自动使用程序化占位图 |
| adcode / pcode | string | 否 | 行政区划编码 |
| cityname | string | 是 | 城市名 |

## 4. 接口定义

### 4.1 列表 — GET /api/cafes

查询参数（均可选）：

| 参数 | 说明 |
|---|---|
| page / size | 分页，默认 `1 / 20` |
| area | 按 `business_area` 精确筛选 |
| q | 关键词，匹配 `name / address / tags` |
| sort | `rating_desc` \| `cost_asc` \| `cost_desc` \| `id_asc`(默认) |

```bash
curl 'https://api.your-domain.com/api/cafes?area=静安寺&sort=rating_desc'
```

### 4.2 详情 — GET /api/cafes/:id

`data` 为单个 Cafe 对象；不存在返回 `code: 40401`。

### 4.3 新增 — POST /api/cafes

请求体为不含 `id` 的 Cafe；成功返回创建后的完整对象（含 `id`），HTTP 201。

```bash
curl -X POST https://api.your-domain.com/api/cafes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"name":"示例咖啡(某某店)","address":"某路 1 号","location":"121.47,31.23","business_area":"静安寺","type":"咖啡厅","rating":"4.6","cost":"45.00","cityname":"上海市","tags":["咖啡厅"]}'
```

### 4.4 更新 — PUT /api/cafes/:id

请求体为需要变更的字段（部分更新语义）；返回更新后的完整对象。

### 4.5 删除 — DELETE /api/cafes/:id

成功返回 `{ "code": 0, "msg": "ok", "data": { "id": 3 } }`。

### 4.6 批量导入 — POST /api/cafes/batch

请求体为 `Cafe[]`（即本项目 `data/cafes.json` 的格式），用于一键迁移现有数据；返回 `{ "created": n }`。

## 5. 错误码

| code | 含义 |
|---|---|
| 0 | 成功 |
| 40001 | 参数校验失败（`msg` 指明字段） |
| 40101 | 未授权 / token 失效 |
| 40401 | 资源不存在 |
| 40901 | 冲突（如重复导入相同 id） |
| 50000 | 服务端内部错误 |

## 6. 前端侧对应实现（已就绪，勿改）

`index.html` 中的 `DataService` 即为接入点：

```js
const DataService = {
  base: window.SITE_API_BASE || null,
  async load(){
    if (this.base) try { /* GET {base}/api/cafes → data.list */ } catch(e){}
    try { /* ./data/cafes.json */ } catch(e){}
    return SEED; // 内嵌兜底
  }
};
```

需要「手动刷新」能力时，可在控制台或自定义按钮中调用：

```js
DataService.load().then(list => { /* 页面会用新数据重建卡片 */ });
```

## 7. 建议的后端最小实现清单

任选一种栈（Express / Koa / FastAPI / Spring 皆可），只需：一张 `cafes` 表（字段同 §3）、六个路由（§4）、统一信封中间件、CORS 白名单。`data/cafes.json` 可直接作为初始化种子通过 §4.6 导入。
