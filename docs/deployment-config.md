# 部署配置清单（8089 管理后台 / 8091 独立商城）

目的：**迁移到 Hetzner 只改部署配置与环境变量，不改业务源码。**
端口、域名、内部地址一律通过环境变量注入；源码里只有 `storefront/src/lib/origins.ts`
与 `server/index.js` 保留了「本地开发兜底」，生产环境不会静默回退。

## 一、8089（Fastify 管理后台 + API）

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 是 | 监听端口。默认 8089，生产建议显式写 |
| `DATABASE_URL` | 是 | 应用连接串（允许 `-pooler`，内部会自动改走直连） |
| `DATABASE_URL_UNPOOLED` / `DIRECT_DATABASE_URL` | 迁移时 | 直连串，`node migrate.js` 用 |
| `OBJECT_STORAGE_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY` / `_SECRET_KEY` | 是 | R2 / S3 兼容对象存储 |
| `ALSVID_PREVIEW_SECRET` | 是 | 预览令牌 HMAC 密钥，**至少 32 字节**。不足 32 字节视为未配置（接口 503） |
| `ALSVID_REVALIDATE_TOKEN` | 是 | 8089 → 8091 缓存刷新的共享密钥，至少 16 字节 |
| `ALSVID_STOREFRONT_ORIGIN` | 是 | 8091 的**内部**地址（服务端调 `/api/revalidate` 用），如 `http://127.0.0.1:8091` |
| `ALSVID_STOREFRONT_PUBLIC_ORIGIN` | 是 | 8091 的**对外**地址（后台「新站预览」在浏览器打开用），如 `https://www.alsvidbike.com` |
| `ALSVID_LAYOUT_VERSION_STRICT` | 上线必须 `1` | 版本快照保存失败时**禁止发布**，不允许放出无法回滚的版本 |
| `ALSVID_PRODUCTION_API_BASE` | 可选 | V1.0 旧站推送地址；不配则该通道 skipped |
| `ALSVID_LAYOUT_SYNC_TOKEN` | 可选 | 同上 |
| `ALSVID_SECRET_JSON` | 本地/容器 | 免 gcloud 的配置注入方式（内容是上述键的 JSON） |

> 内部地址与对外地址必须分开配：`ALSVID_STOREFRONT_ORIGIN` 走内网，浏览器访问不到；
> `ALSVID_STOREFRONT_PUBLIC_ORIGIN` 是对外域名。混用会导致「预览打不开」或「刷新连不上」。

## 二、8091（Next.js 独立商城）

| 变量 | 必填 | 说明 |
|---|---|---|
| `ALSVID_API_ORIGIN` | 是 | 服务端访问 8089 的内部地址。**生产缺失会返回 503 并提示变量名**，不再回退 localhost |
| `SITE_ORIGINS` | 是 | 浏览器访问本站的来源，逗号分隔。**决定会话 Cookie 是否加 `Secure`**，必须与真实协议一致 |
| `ALSVID_REVALIDATE_TOKEN` | 是 | 与 8089 同值，校验刷新请求 |
| `NODE_ENV` | 是 | `production` 时才启用「缺配置就报错」的行为 |

`SITE_URL` 可作为 `SITE_ORIGINS` 的替代（单值场景），canonical / sitemap / JSON-LD 用
`SITE_URL` → `SITE_ORIGINS` → 正式域名 的顺序取。

## 三、已消除的硬编码

| 位置 | 原问题 | 现状 |
|---|---|---|
| `storefront` 全部页面/组件 | 图片地址拼成 `http://127.0.0.1:8089/...` 写进 HTML | 浏览器渲染一律用同源相对路径（`/api/*` 有代理）；仅 JSON-LD 用 `absoluteApiUrl()` |
| `components/product-gallery.tsx` | 客户端组件读不到服务端 env，实际固化成 localhost | 改为相对路径，不再读 env |
| `client` 后台「新站预览」 | `VITE_STOREFRONT_ORIGIN` 兜底 `http://localhost:8091` | 改为读 8089 的 `/api/site/layout-draft/storefront-revalidate` 返回的 `storefrontPublicOrigin` |
| `client` 接口页徽标 | 写死 `:8089` | 显示 `window.location.host` |
| `next.config.ts` | `new URL(apiOrigin)` 在缺配置时直接抛错 | 容错并打印告警，不阻断构建 |

## 四、上线前必查

1. `ALSVID_LAYOUT_VERSION_STRICT=1`，并确认发布时版本表可写（否则发布会正确失败）。
2. 迁移 178 已在目标库应用（`scripts/acceptance-178.mjs` 可一键验收 01/02）。
3. `ALSVID_PREVIEW_SECRET` / `ALSVID_REVALIDATE_TOKEN` 为**独立生成**的新密钥，不复用本地值。
4. `SITE_ORIGINS` 为 `https://` 开头，确保会话 Cookie 带 `Secure`。
5. 8091 的 `ALSVID_API_ORIGIN` 指向内网地址，不走公网绕行。
