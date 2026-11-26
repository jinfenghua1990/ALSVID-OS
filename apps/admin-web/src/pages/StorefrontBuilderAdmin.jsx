import { useEffect, useRef, useState } from 'react';
import grapesjs from 'grapesjs';
import grapesjsZh from 'grapesjs/locale/zh';
import 'grapesjs/dist/css/grapes.min.css';
import { api } from '../api.js';
import StorefrontLayoutVersions from './StorefrontLayoutVersions.jsx';
import StorefrontLayoutReleaseReview from './StorefrontLayoutReleaseReview.jsx';
import './storefront-builder.css';
import { LAYOUT_LANGS, canvasStrings, translateHtml, localeDocument, coverageOf, nameLayers, migrateLegacyTranslations, translationValue, entryStatus } from '../storefront-i18n.js';


const INITIAL_HTML = `<main class="alsvid-storefront">
  <header class="storefront-nav"><a class="brand" href="/"><img src="/alsvid-logo.png" alt="ALSVID" style="display:block;width:140px;height:30px;object-fit:cover"></a><nav>整车　车型　配件　品牌故事</nav><span>购物袋</span></header>
  <section class="hero" data-alsvid-block="hero"><div class="hero-copy"><p class="eyebrow">ALSVID ELECTRIC MOBILITY</p><h1>为每一段旅程<br>重新定义自由。</h1><p class="hero-subtitle">轻量设计，城市灵感，开启属于你的骑行方式。</p><a class="button" href="/www/zh/products">探索整车　→</a></div><div class="hero-visual"><div class="bike-placeholder">双击此处，替换为整车主视觉图片</div><span class="visual-note">首页主视觉 · 可自由替换</span></div><span class="hero-index">01 / 04</span></section>
  <section class="intro"><p class="eyebrow">CHOOSE YOUR RIDE</p><h2>找到适合你的骑行方式</h2><p>拖动左侧模块，自由组合商城首页。当前是独立预览，不会修改正式官网。</p></section>
  <section class="model-grid" data-alsvid-block="product-grid"><article class="model-card"><div class="product-image">插入已发布商品模块</div><p class="eyebrow">FOLDING SERIES</p><h3>商品展示</h3><p>商品发布到官网后，这里会自动显示真实商品</p></article><article class="model-card"><div class="product-image product-image-alt">插入已发布商品模块</div><p class="eyebrow">CITY SERIES</p><h3>商品展示</h3><p>可拖动、复制、删除并调整样式</p></article><article class="model-card"><div class="product-image product-image-third">插入已发布商品模块</div><p class="eyebrow">TOURING SERIES</p><h3>商品展示</h3><p>正式商城和订单功能独立管理</p></article></section>
  <section class="editorial" data-alsvid-block="image-text"><div><p class="eyebrow">MADE FOR YOUR EVERYDAY</p><h2>把日常骑行<br>变成喜欢的生活。</h2><p>在这里编辑品牌故事、产品优势和骑行场景。图片、文字、布局与按钮都可以调整。</p><a class="text-link" href="#">了解 ALSVID　→</a></div><div class="editorial-image">品牌故事图片区域</div></section>
  <section class="service-row" data-alsvid-block="service"><div><strong>01</strong><h3>欧洲配送</h3><p>配置真实的配送范围与时效。</p></div><div><strong>02</strong><h3>质保支持</h3><p>展示经过确认的质保政策。</p></div><div><strong>03</strong><h3>售后与配件</h3><p>让客户快速找到服务支持。</p></div></section>
  <footer class="storefront-footer"><a class="brand" href="/"><img src="/alsvid-logo.png" alt="ALSVID" style="display:block;width:140px;height:30px;object-fit:cover"></a><p>骑行自由，从这里开始。</p><span>帮助中心　配送政策　退货政策　联系我们</span></footer>
</main>`;

const INITIAL_CSS = `*{box-sizing:border-box}.alsvid-storefront{font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:#18201d;background:#fff;max-width:1440px;margin:0 auto}.alsvid-storefront a{color:inherit;text-decoration:none}.storefront-nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 6%;border-bottom:1px solid #e7eae7;gap:24px}.brand{font-size:20px;font-weight:800;letter-spacing:.28em;color:#18201d;text-decoration:none}.storefront-nav nav{font-size:13px;letter-spacing:.08em;color:#49524d}.hero{position:relative;min-height:500px;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:70px 8%;gap:42px;background:linear-gradient(120deg,#f1f3ee,#dfe7df)}.hero-copy{max-width:480px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:.22em;color:#6d7b70;margin:0 0 18px}.hero h1{font-size:clamp(30px,4vw,54px);line-height:1.18;letter-spacing:-.04em;margin:0 0 22px}.hero-subtitle{font-size:14px;line-height:1.8;color:#58645c;margin:0 0 30px}.alsvid-storefront a.button{display:inline-block;padding:13px 22px;background:#18201d;color:#fff;text-decoration:none;font-size:12px;letter-spacing:.08em;border-radius:2px}.hero-visual{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:270px;gap:12px}.bike-placeholder{width:100%;min-height:260px;display:grid;place-items:center;border:1px dashed #9aa79b;background:rgba(255,255,255,.48);color:#657168;text-align:center;padding:24px;font-size:13px}.visual-note{font-size:10px;color:#758078}.hero-index{position:absolute;bottom:22px;right:6%;font-size:10px;letter-spacing:.16em;color:#68756b}.intro{text-align:center;padding:76px 8% 36px}.intro h2,.editorial h2{font-size:clamp(26px,3vw,38px);line-height:1.3;letter-spacing:-.03em;margin:0 0 14px}.intro>p:last-child{font-size:13px;color:#778078;line-height:1.8;max-width:560px;margin:0 auto}.model-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:28px 6% 78px}.model-card{min-width:0}.product-image{height:220px;display:grid;place-items:center;background:#f0f2ee;color:#7c867d;font-size:12px;margin-bottom:22px}.product-image-alt{background:#e9eeeb}.product-image-third{background:#e8ecef}.model-card .eyebrow{margin-bottom:10px}.model-card h3{font-size:22px;margin:0 0 9px}.model-card p:not(.eyebrow){font-size:12px;color:#778078}.text-link{display:inline-block;margin-top:8px;color:#1c2922;font-size:12px;text-decoration:none;border-bottom:1px solid #9aa79b;padding-bottom:5px}.editorial{display:grid;grid-template-columns:.9fr 1.1fr;gap:56px;align-items:center;padding:70px 8%;background:#f6f7f4}.editorial>div:first-child>p:not(.eyebrow){font-size:13px;line-height:1.9;color:#6c766e;max-width:390px}.editorial-image{min-height:280px;background:#e3e8e2;display:grid;place-items:center;border:1px dashed #aeb9ae;color:#6f7c70;font-size:12px}.service-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;padding:62px 8%;border-bottom:1px solid #e7eae7}.service-row>div{border-top:1px solid #cfd6cf;padding-top:18px}.service-row strong{font-size:10px;color:#829084;letter-spacing:.18em}.service-row h3{font-size:17px;margin:14px 0 8px}.service-row p{font-size:12px;line-height:1.8;color:#788179}.storefront-footer{padding:34px 6%;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.storefront-footer p,.storefront-footer span{font-size:11px;color:#7a837c}.storefront-footer .brand{font-size:17px}@media(max-width:680px){.storefront-nav{height:60px;padding:0 5%}.storefront-nav nav{display:none}.hero{grid-template-columns:1fr;padding:50px 7% 64px;gap:24px}.hero-visual{min-height:190px}.bike-placeholder{min-height:180px}.model-grid{grid-template-columns:1fr;padding:20px 7% 50px}.product-image{height:230px}.editorial{grid-template-columns:1fr;padding:50px 7%;gap:24px}.service-row{grid-template-columns:1fr;padding:42px 7%;gap:14px}.intro{padding:52px 7% 26px}.storefront-footer{align-items:flex-start;flex-direction:column}}`;

const MOTION_OPTIONS = [
  { id: 'nav-underline', group: '导航与按钮', name: '导航悬停下划线', note: '导航链接悬停时出现细下划线' },
  { id: 'button-lift', group: '导航与按钮', name: '按钮轻抬与回弹', note: '行动按钮悬停轻抬，松开后平滑复位' },
  { id: 'button-ripple', group: '导航与按钮', name: '按钮点击涟漪', note: '按下行动按钮时扩散一圈柔和波纹' },
  { id: 'card-tilt', group: '商品卡片', name: '商品卡片倾斜', note: '悬停时轻微抬升和倾斜' },
  { id: 'card-spotlight', group: '商品卡片', name: '商品卡片聚光', note: '悬停时卡片底色柔和提亮' },
  { id: 'image-zoom', group: '商品卡片', name: '商品图片放大', note: '悬停商品图时缓慢放大' },
  { id: 'image-reveal', group: '商品卡片', name: '图片蒙层显现', note: '图片悬停时显示轻柔高光' },
  { id: 'link-arrow', group: '链接与标签', name: '链接箭头滑动', note: '商品卡片链接悬停时箭头向右移动' },
  { id: 'tab-indicator', group: '链接与标签', name: '标签切换指示线', note: '页面标签获得焦点或选中时显示滑动指示线' },
  { id: 'tooltip', group: '内容反馈', name: '提示气泡', note: '给元素添加 data-tip="说明文字" 后显示提示气泡' },
  { id: 'accordion', group: '内容反馈', name: '折叠面板', note: '为原生 details/summary 折叠内容增加平滑反馈' },
  { id: 'toast', group: '内容反馈', name: '轻提示滑入', note: '给提示容器添加 .alsvid-toast 和 data-state="open" 后启用' },
  { id: 'drawer', group: '购物袋与结账', name: '购物袋抽屉', note: '给侧边面板添加 .alsvid-cart-drawer 和 data-state="open" 后启用' },
  { id: 'modal', group: '购物袋与结账', name: '弹窗柔和入场', note: '为 aria-modal="true" 的弹窗增加淡入与背景模糊' },
  { id: 'error-shake', group: '购物袋与结账', name: '错误输入轻抖', note: '输入框设置 aria-invalid="true" 后轻抖提示' },
  { id: 'carousel', group: '商品浏览', name: '商品横向拖动', note: '为 .alsvid-carousel 容器启用触控友好的横向吸附' },
];

const MOTION_CSS = `
.alsvid-storefront[data-alsvid-motion~="nav-underline"] .storefront-nav nav a{position:relative}
.alsvid-storefront[data-alsvid-motion~="nav-underline"] .storefront-nav nav a::after{content:"";position:absolute;left:0;right:100%;bottom:-5px;height:1px;background:currentColor;transition:right .24s ease}
.alsvid-storefront[data-alsvid-motion~="nav-underline"] .storefront-nav nav a:hover::after{right:0}
.alsvid-storefront[data-alsvid-motion~="button-lift"] a.button,.alsvid-storefront[data-alsvid-motion~="button-lift"] button{transition:transform .22s ease,box-shadow .22s ease}
.alsvid-storefront[data-alsvid-motion~="button-lift"] a.button:hover,.alsvid-storefront[data-alsvid-motion~="button-lift"] button:hover{transform:translateY(-2px);box-shadow:0 7px 18px rgba(18,32,24,.16)}
.alsvid-storefront[data-alsvid-motion~="button-ripple"] a.button,.alsvid-storefront[data-alsvid-motion~="button-ripple"] button{position:relative;overflow:hidden;isolation:isolate}
.alsvid-storefront[data-alsvid-motion~="button-ripple"] a.button::after,.alsvid-storefront[data-alsvid-motion~="button-ripple"] button::after{content:"";position:absolute;z-index:-1;width:10px;height:10px;left:50%;top:50%;border-radius:50%;background:rgba(255,255,255,.35);opacity:0;transform:translate(-50%,-50%) scale(1);transition:transform .5s ease,opacity .5s ease}
.alsvid-storefront[data-alsvid-motion~="button-ripple"] a.button:active::after,.alsvid-storefront[data-alsvid-motion~="button-ripple"] button:active::after{opacity:1;transform:translate(-50%,-50%) scale(22)}
.alsvid-storefront[data-alsvid-motion~="card-tilt"] .model-card{transition:transform .28s ease,box-shadow .28s ease;transform-style:preserve-3d}
.alsvid-storefront[data-alsvid-motion~="card-tilt"] .model-card:hover{transform:perspective(900px) translateY(-4px) rotateX(1deg) rotateY(-1deg);box-shadow:0 12px 28px rgba(24,32,29,.12)}
.alsvid-storefront[data-alsvid-motion~="card-spotlight"] .model-card{transition:background-color .25s ease,box-shadow .25s ease}
.alsvid-storefront[data-alsvid-motion~="card-spotlight"] .model-card:hover{background:radial-gradient(ellipse at 50% 20%,rgba(138,219,58,.12),transparent 72%);box-shadow:0 0 0 1px rgba(90,140,45,.18)}
.alsvid-storefront[data-alsvid-motion~="image-zoom"] .product-image{overflow:hidden}
.alsvid-storefront[data-alsvid-motion~="image-zoom"] .product-image img{transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.alsvid-storefront[data-alsvid-motion~="image-zoom"] .model-card:hover .product-image img{transform:scale(1.045)}
.alsvid-storefront[data-alsvid-motion~="image-reveal"] .product-image{position:relative;overflow:hidden}
.alsvid-storefront[data-alsvid-motion~="image-reveal"] .product-image::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 20%,rgba(255,255,255,.32) 48%,transparent 72%);transform:translateX(-120%);transition:transform .65s ease;pointer-events:none}
.alsvid-storefront[data-alsvid-motion~="image-reveal"] .model-card:hover .product-image::after{transform:translateX(120%)}
.alsvid-storefront[data-alsvid-motion~="link-arrow"] .model-card a span{display:inline-block;transition:transform .2s ease}
.alsvid-storefront[data-alsvid-motion~="link-arrow"] .model-card a:hover span{transform:translateX(5px)}
.alsvid-storefront[data-alsvid-motion~="tab-indicator"] [role="tab"]{position:relative}
.alsvid-storefront[data-alsvid-motion~="tab-indicator"] [role="tab"]::after{content:"";position:absolute;left:0;right:100%;bottom:-2px;height:2px;background:#78bd26;transition:right .22s ease}
.alsvid-storefront[data-alsvid-motion~="tab-indicator"] [role="tab"]:hover::after,.alsvid-storefront[data-alsvid-motion~="tab-indicator"] [role="tab"][aria-selected="true"]::after{right:0}
.alsvid-storefront[data-alsvid-motion~="tooltip"] [data-tip]{position:relative}
.alsvid-storefront[data-alsvid-motion~="tooltip"] [data-tip]::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 9px);z-index:20;width:max-content;max-width:240px;padding:7px 10px;border-radius:5px;background:#18201d;color:#fff;font-size:11px;line-height:1.45;opacity:0;pointer-events:none;transform:translate(-50%,4px);transition:opacity .18s ease,transform .18s ease}
.alsvid-storefront[data-alsvid-motion~="tooltip"] [data-tip]:hover::after,.alsvid-storefront[data-alsvid-motion~="tooltip"] [data-tip]:focus-visible::after{opacity:1;transform:translate(-50%,0)}
.alsvid-storefront[data-alsvid-motion~="accordion"] details>summary{cursor:pointer;list-style:none}
.alsvid-storefront[data-alsvid-motion~="accordion"] details>summary::-webkit-details-marker{display:none}
.alsvid-storefront[data-alsvid-motion~="accordion"] details[open]>summary{color:#567f23}
.alsvid-storefront[data-alsvid-motion~="toast"] .alsvid-toast{opacity:0;transform:translateY(12px);transition:opacity .2s ease,transform .2s ease;pointer-events:none}
.alsvid-storefront[data-alsvid-motion~="toast"] .alsvid-toast[data-state="open"]{opacity:1;transform:translateY(0);pointer-events:auto}
.alsvid-storefront[data-alsvid-motion~="drawer"] .alsvid-cart-drawer{transform:translateX(100%);visibility:hidden;transition:transform .28s ease,visibility .28s}
.alsvid-storefront[data-alsvid-motion~="drawer"] .alsvid-cart-drawer[data-state="open"]{transform:translateX(0);visibility:visible}
.alsvid-storefront[data-alsvid-motion~="modal"] [aria-modal="true"]{animation:alsvid-modal-in .22s ease both;backdrop-filter:blur(5px)}
@keyframes alsvid-modal-in{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
.alsvid-storefront[data-alsvid-motion~="error-shake"] [aria-invalid="true"]{animation:alsvid-error-shake .28s ease}
@keyframes alsvid-error-shake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.alsvid-storefront[data-alsvid-motion~="carousel"] .alsvid-carousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.alsvid-storefront[data-alsvid-motion~="carousel"] .alsvid-carousel>*{flex:0 0 min(86%,420px);scroll-snap-align:start}
@media(prefers-reduced-motion:reduce){.alsvid-storefront[data-alsvid-motion] *, .alsvid-storefront[data-alsvid-motion] *::before,.alsvid-storefront[data-alsvid-motion] *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
`;

const motionIds = editor => editor?.getWrapper?.().find('.alsvid-storefront')?.[0]?.getAttributes?.()['data-alsvid-motion']?.split(/\s+/).filter(Boolean) || [];
const syncMotionIds = (editor, ids) => {
  const root = editor?.getWrapper?.().find('.alsvid-storefront')?.[0];
  if (!root) return;
  if (ids.length) root.addAttributes({ 'data-alsvid-motion': ids.join(' ') });
  else root.removeAttributes('data-alsvid-motion');
};
const ensureMotionCss = editor => {
  const css = editor.getCss();
  if (!css.includes('alsvid-motion-library')) editor.setStyle(css + '\n.alsvid-storefront{--alsvid-motion-library:1}\n' + MOTION_CSS);
};
// 外部页面导入的版式用 {imported:true} 占位 project，画布由 html/css 重建。
const isImportedLayout = project => !!(project && project.imported === true);
const applyDraftToEditor = (editor, draft) => {
  if (isImportedLayout(draft.project)) {
    editor.setComponents(draft.html || INITIAL_HTML);
    editor.setStyle((draft.css || INITIAL_CSS) + '\n.alsvid-storefront{--alsvid-motion-library:1}\n' + MOTION_CSS);
    return true;
  }
  editor.loadProjectData(draft.project);
  return false;
};

const I18N = {
  locale: 'zh', detectLocale: false, localeFallback: 'zh', messages: { zh: {
    ...grapesjsZh,
    general: { add: '添加', close: '关闭', cancel: '取消', confirm: '确认', delete: '删除', remove: '移除', move: '移动', copy: '复制', paste: '粘贴', settings: '设置', apply: '应用' },
    blockManager: { labels: { text: '文本', image: '图片', link: '链接', video: '视频' }, categories: { Basic: '基础模块', Layout: '布局模块' } },
    domComponents: { ...grapesjsZh.domComponents, names: { ...grapesjsZh.domComponents.names, '': '容器', wrapper: '页面' } },
    deviceManager: { ...grapesjsZh.deviceManager, devices: { ...grapesjsZh.deviceManager.devices, mobileLandscape: '横屏手机', mobilePortrait: '竖屏手机' } },
    styleManager: { ...grapesjsZh.styleManager, empty: '请选择一个元素，然后编辑样式。', sectors: { ...grapesjsZh.styleManager.sectors, general: '常规', dimension: '尺寸', typography: '文字', decorations: '装饰', extra: '其他' } },
    traitManager: { ...grapesjsZh.traitManager, traits: { ...grapesjsZh.traitManager.traits, attributes: { ...grapesjsZh.traitManager.traits.attributes, href: { placeholder: '例如 https://example.com' } } } },
    layerManager: { empty: '暂无图层', label: '图层' },
    selectorManager: { ...grapesjsZh.selectorManager, label: '样式类', selected: '已选', emptyState: '状态', states: { hover: '悬停', active: '点击', 'nth-of-type(2n)': '奇数/偶数' } },
    assetManager: { ...grapesjsZh.assetManager, addButton: '添加图片', inputPlh: '输入图片地址', modalTitle: '选择图片', uploadTitle: '点击或拖拽图片上传' },
  } },
};

function downloadText(filename, content, type) {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function cardHtml(item) {
  const image = item.image ? '<div class="product-image"><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.title) + '" style="width:100%;height:100%;object-fit:contain"></div>' : '<div class="product-image">暂无商品图片</div>';
  return '<article class="model-card" data-alsvid-product-id="' + escapeHtml(item.id) + '"><a class="text-link" href="/www/zh/products/' + encodeURIComponent(item.slug || item.id) + '">' + image +
    '<p class="eyebrow">' + escapeHtml(item.model || item.kind || 'ALSVID') + '</p><h3>' + escapeHtml(item.title) + '</h3><span>' + (item.published ? '查看详情 →' : '待发布到官网') + '</span></a></article>';
}
function gridSection(items) {
  return '<section class="model-grid" data-alsvid-block="product-grid">' + items.map(cardHtml).join('') + '</section>';
}
function homepageWith(items) {
  if (!items.length) return INITIAL_HTML;
  return INITIAL_HTML.replace(/<section class="model-grid"[\s\S]*?<\/section>/, gridSection(items));
}

export default function StorefrontBuilderAdmin({ active = true, user, onDirtyChange, onClose }) {
  const canvasRef = useRef(null), blocksRef = useRef(null), layersRef = useRef(null), stylesRef = useRef(null), fileRef = useRef(null), i18nFileRef = useRef(null), editorRef = useRef(null);
  // 外部页面导入的版式（如 V1.0 官网首页）没有 GrapesJS 方案：822 KB 的 project 在这种
  // 跨区数据库链路上要读几十秒。这类版式以 html/css 为准，画布由 html/css 现场重建。
  const importedRef = useRef(false);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('商城装修使用 V2 云端草稿，保存不会直接替换访客看到的官网。');
  const [dirty, setDirty] = useState(false), [version, setVersion] = useState(null), [busy, setBusy] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState(null), [publishedAt, setPublishedAt] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [registry, setRegistry] = useState([]), [registryState, setRegistryState] = useState('loading');
  const [leftTab, setLeftTab] = useState('blocks'), [device, setDevice] = useState('桌面端'), preview = false;
  // 版本管理面板：发布后需要能查看历史、对比与回滚
  const [showVersions, setShowVersions] = useState(false);
  const [motionEffects, setMotionEffects] = useState([]);
  // 语言：zh 是中国稿（唯一可编辑），en/de 是只读预览的文本层
  const [lang, setLang] = useState('zh'), [i18nLang, setI18nLang] = useState('en');
  const [translations, setTranslations] = useState({ en: {}, de: {} });
  const [strings, setStrings] = useState([]), [langDoc, setLangDoc] = useState(''), [selectedInfo, setSelectedInfo] = useState('');
  // 已发布商品（含三语标题/主图）：仅用于「云端无草稿时自动生成首页」的数据源
  const [products, setProducts] = useState([]);
  // 自动生成首页时取德语标题/主图（站点默认语言）；生成后运营可在编辑器里逐处改
  const productLocale = 'de';
  // 各语言各自的线上状态（中文/英文/德文分别上线），null 表示还没读到
  const [localeStatus, setLocaleStatus] = useState(null);
  const [releaseReview, setReleaseReview] = useState(null);

  useEffect(() => {
    if (!active || user?.role !== 'admin') return undefined;
    let cancelled = false;
    setRegistryState('loading');
    api.products().then(rows => {
      if (cancelled) return;
      setRegistry((rows || []).filter(row => row.status !== '停用'));
      setRegistryState('ready');
    }).catch(() => { if (!cancelled) setRegistryState('error'); });
    return () => { cancelled = true; };
  }, [active, user?.role]);

  useEffect(() => {
    if (!active || user?.role !== 'admin') return undefined;
    const controller = new AbortController();
    Promise.all(['zh', 'en', 'de'].map(async lang => {
      const response = await fetch('/api/catalog/products?lang=' + lang + '&page=1', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '读取已发布商品失败');
      return [lang, data.items || []];
    })).then(rows => {
      const merged = new Map();
      for (const [lang, items] of rows) for (const item of items) {
        const current = merged.get(item.productId) || { id: item.productId, slug: item.slug, kind: item.kind, model: item.model, titles: {}, images: {} };
        current.titles[lang] = item.title;
        if (item.images?.[0]?.url) current.images[lang] = item.images[0].url;
        merged.set(item.productId, current);
      }
      if (!controller.signal.aborted) setProducts(Array.from(merged.values()));
    }).catch(() => {
      // 读不到已发布商品时保持空数组：自动生成首页会回退到产品主档，不必打断装修
      if (!controller.signal.aborted) setProducts([]);
    });
    return () => controller.abort();
  }, [active, user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' || !canvasRef.current || !blocksRef.current || !layersRef.current || !stylesRef.current) return undefined;
    let disposed = false;
    const editor = grapesjs.init({
      container: canvasRef.current, height: '100%', width: 'auto', fromElement: false, storageManager: false, panels: { defaults: [] },
      i18n: I18N,
      deviceManager: { devices: [{ name: '桌面端', width: '' }, { name: '平板端', width: '768px' }, { name: '手机端', width: '390px' }] },
      blockManager: { appendTo: blocksRef.current, blocks: [
        { id: 'alsvid-hero', label: '主视觉横幅', category: '首页模块', content: '<section class="hero" data-alsvid-block="hero"><div class="hero-copy"><p class="eyebrow">ALSVID ELECTRIC MOBILITY</p><h1>编辑首页主标题</h1><p class="hero-subtitle">添加品牌介绍文字</p><a class="button" href="/www/zh/products">立即探索 →</a></div><div class="hero-visual"><div class="bike-placeholder">替换为整车主视觉图片</div></div></section>' },
        { id: 'alsvid-product-grid', label: '商品展示区', category: '商品模块', content: '<section class="model-grid" data-alsvid-block="product-grid"><article class="model-card"><div class="product-image">商品图片</div><p class="eyebrow">MODEL SERIES</p><h3>车型名称</h3><p>使用已发布商品关联</p></article><article class="model-card"><div class="product-image">商品图片</div><p class="eyebrow">MODEL SERIES</p><h3>车型名称</h3><p>使用已发布商品关联</p></article></section>' },
        { id: 'alsvid-image-text', label: '图文介绍', category: '内容模块', content: '<section class="editorial" data-alsvid-block="image-text"><div><p class="eyebrow">品牌故事</p><h2>编辑品牌故事</h2><p>在这里介绍产品设计、骑行体验或品牌理念。</p><a class="text-link" href="#">了解更多 →</a></div><div class="editorial-image">替换图片</div></section>' },
        { id: 'alsvid-image', label: '单张图片', category: '内容模块', content: '<section class="editorial-image" data-alsvid-block="image">编辑元素属性以替换图片</section>' },
        { id: 'alsvid-service', label: '服务保障', category: '内容模块', content: '<section class="service-row" data-alsvid-block="service"><div><strong>01</strong><h3>配送服务</h3><p>编辑配送说明。</p></div><div><strong>02</strong><h3>质保政策</h3><p>编辑质保信息。</p></div><div><strong>03</strong><h3>售后支持</h3><p>编辑售后支持。</p></div></section>' },
        { id: 'alsvid-heading', label: '标题与正文', category: '基础模块', content: '<section style="padding:48px 8%;"><h2>在此输入标题</h2><p>双击文字即可编辑内容。</p></section>' },
        { id: 'alsvid-button', label: '行动按钮', category: '基础模块', content: '<div style="padding:20px 8%;"><a class="button" href="#">编辑按钮文字与链接 →</a></div>' },
        { id: 'alsvid-spacer', label: '留白间距', category: '基础模块', content: '<div style="height:64px;" data-alsvid-block="spacer"></div>' },
        { id: 'alsvid-footer', label: '页脚信息', category: '页脚模块', content: '<footer class="storefront-footer" data-alsvid-block="footer"><a class="brand" href="/"><img src="/alsvid-logo.png" alt="ALSVID" style="display:block;width:140px;height:30px;object-fit:cover"></a><p>骑行自由，从这里开始。</p><span>帮助中心　配送政策　退货政策　联系我们</span></footer>' },
      ] },
      layerManager: { appendTo: layersRef.current },
      styleManager: { appendTo: stylesRef.current, sectors: [
        { name: '布局', open: true, buildProps: ['display', 'flex-direction', 'justify-content', 'align-items', 'gap'] },
        { name: '尺寸与间距', open: true, buildProps: ['width', 'height', 'min-height', 'max-width', 'margin', 'padding'] },
        { name: '文字样式', open: false, buildProps: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'color'] },
        { name: '背景与边框', open: false, buildProps: ['background-color', 'background', 'border', 'border-radius', 'box-shadow'] },
        { name: '定位', open: false, buildProps: ['position', 'top', 'right', 'bottom', 'left'] },
      ] },
      selectorManager: { componentFirst: true }, components: INITIAL_HTML, style: INITIAL_CSS + '\n.alsvid-storefront{--alsvid-motion-library:1}\n' + MOTION_CSS,
    });
    editorRef.current = editor;
    let initialLoadComplete = false;
    editor.on('update', () => { if (initialLoadComplete) setDirty(true); });
    editor.on('component:selected', comp => setSelectedInfo(comp?.getName?.() || comp?.get?.('tagName') || '元素'));
    editor.on('component:deselected', () => setSelectedInfo(''));
    setReady(false); setError(''); setVersion(null); setNotice('正在读取 V2 云端商城装修草稿…');
    // 生产同步是否已配置：决定提示条说「会同步线上」还是「只发布本系统」
    api.layoutProductionSyncStatus().then(r => { if (!disposed) setSyncStatus(r?.data || null); }).catch(() => {});
    api.storefrontLayoutDraft().then(result => {
      if (disposed) return;
      const draft = result.data;
      if (draft) { importedRef.current = applyDraftToEditor(editor, draft); ensureMotionCss(editor); setMotionEffects(motionIds(editor)); nameLayers(editor); setVersion(draft.version); setPublishedVersion(draft.publishedVersion || null); setPublishedAt(draft.publishedAt || ''); const adopted = adoptTranslations(editor, draft.translations); setDirty(adopted.migrated > 0); setNotice((isImportedLayout(draft.project) ? '已读取导入版式草稿（以 HTML/CSS 为准，可直接可视化编辑）。' : '已读取 V2 云端商城装修草稿。') + (adopted.migrated ? ' 已把 ' + adopted.migrated + ' 条旧格式译文升级为内容 ID 格式（原文未变，译文照常生效），请保存草稿固化。' : '')); }
      else { setVersion(0); setPublishedVersion(null); setNotice('V2 云端尚无装修草稿；已按现有商品自动生成一版首页，确认后点「发布到官网首页」。'); }
      initialLoadComplete = true;
      setReady(true);
    }).catch(reason => {
      if (!disposed) {
        initialLoadComplete = true;
        setError(reason.message);
        setVersion(null);
        setNotice('云端草稿读取失败。可重试读取，或先导出本地方案；读取成功前不能保存到云端。');
        setReady(true);
      }
    });
    return () => { disposed = true; editor.destroy(); editorRef.current = null; setReady(false); };
  }, [user?.role]);

  useEffect(() => {
    if (!active || !editorRef.current) return;
    requestAnimationFrame(() => editorRef.current?.refresh());
  }, [active]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeLeaving = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // 画布里的中文文案清单：切语言、切到翻译面板、草稿变更后刷新
  useEffect(() => {
    if (!ready || !active) return;
    const editor = editorRef.current;
    if (!editor) return;
    setStrings(canvasStrings(editor.getHtml()));
  }, [ready, active, lang, leftTab, version]);

  // 英/德预览：中文稿不动，只按文本层渲染一份只读页面给 iframe 用
  useEffect(() => {
    if (lang === 'zh' || !ready) { setLangDoc(''); return undefined; }
    const timer = setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      setLangDoc(localeDocument(editor.getHtml(), editor.getCss(), translations[lang] || {}));
    }, 260);
    return () => clearTimeout(timer);
  }, [lang, ready, translations]);

  // 各语言线上状态：面板打开、发布/下线后都要重新读，否则按钮显示的是过期状态
  const refreshLocaleStatus = async () => {
    try { const result = await api.storefrontLocaleStatus(); setLocaleStatus(result.data || null); }
    catch (_) { setLocaleStatus(null); }
  };
  useEffect(() => {
    if (!active || user?.role !== 'admin') return;
    refreshLocaleStatus();
  }, [active, user?.role]);

  const loadDraft = async () => {
    const editor = editorRef.current;
    if (!editor || busy) return;
    if (dirty && !window.confirm('读取云端草稿会替换当前未保存的编辑内容，是否继续？')) return;
    setBusy(true); setError('');
    try {
      const snapshot = JSON.stringify(editor.getProjectData()), result = await api.storefrontLayoutDraft();
      if (JSON.stringify(editor.getProjectData()) !== snapshot) throw new Error('读取期间页面有新修改，请先导出方案再重新读取。');
      if (result.data) { importedRef.current = applyDraftToEditor(editor, result.data); ensureMotionCss(editor); setMotionEffects(motionIds(editor)); nameLayers(editor); setVersion(result.data.version); const adopted = adoptTranslations(editor, result.data.translations); setDirty(adopted.migrated > 0); setNotice('已读取 V2 云端商城装修草稿。' + (adopted.migrated ? ' 已把 ' + adopted.migrated + ' 条旧格式译文升级为内容 ID 格式，请保存草稿固化。' : '')); }
      else { importedRef.current = false; editor.setComponents(INITIAL_HTML); editor.setStyle(INITIAL_CSS + '\n.alsvid-storefront{--alsvid-motion-library:1}\n' + MOTION_CSS); setMotionEffects([]); setVersion(0); setDirty(false); setNotice('V2 云端尚无装修草稿，已恢复初始商城模板。'); }
    } catch (reason) { setError(reason.message || '读取云端草稿失败'); }
    finally { setBusy(false); }
  };
  // 把当前编辑器内容快照成 {project, html, css}：html/css 是发布时真正写给访客的东西。
  const pageSnapshot = () => {
    const editor = editorRef.current;
    if (!editor) return null;
    ensureMotionCss(editor);
    // 导入版式只回写 html/css；project 用占位标记，避免把几百 KB 的方案塞回数据库
    const project = importedRef.current ? { imported: true } : editor.getProjectData();
    return { project, html: editor.getHtml(), css: editor.getCss() };
  };
  const saveDraft = async ({ quiet } = {}) => {
    const editor = editorRef.current;
    if (!editor || busy || version === null) return null;
    setBusy(true); setError('');
    try {
      const snapshot = pageSnapshot(), result = await api.saveStorefrontLayoutDraft({ ...snapshot, translations, expectedVersion: version });
      setVersion(result.data.version);
      setDirty(importedRef.current ? false : JSON.stringify(editor.getProjectData()) !== JSON.stringify(snapshot.project));
      if (!quiet) setNotice('商城装修草稿已回写到云端，可继续编辑；点「发布到官网首页」访客才会看到。');
      return result.data.version;
    } catch (reason) {
      setError(reason.status === 409 ? '云端草稿已被其他修改更新，请先重新读取。' : reason.message || '保存云端草稿失败');
      return null;
    } finally { setBusy(false); }
  };
  // 窗口退出：三种出口都放在顶栏同一行。保存退出必须等保存真的成功才关，避免误丢改动。
  const saveAndExit = async () => {
    if (!onClose || busy) return;
    const saved = await saveDraft({ quiet: true });
    if (saved === null) { setError('保存失败，窗口未关闭；请先处理上方提示。'); return; }
    onClose();
  };
  const exitWithoutSaving = () => {
    if (!onClose || busy) return;
    if (dirty && !window.confirm('当前有未保存的修改，退出后不会保留。确定退出不保存？')) return;
    onClose();
  };
  // 保存版本：草稿落盘 + 版本历史留一份可回滚快照，线上 published 完全不动。
  const saveVersion = async () => {
    const editor = editorRef.current;
    if (!editor || busy || version === null) return;
    const note = window.prompt('给这个版本起个名字（可留空，默认是「手动保存 v版本号」）', '');
    if (note === null) return;
    setBusy(true); setError('');
    try {
      const result = await api.saveLayoutSnapshot({ ...pageSnapshot(), translations, expectedVersion: version, note: note.trim() });
      setVersion(result.data.version);
      setDirty(false);
      setShowVersions(true);
      setNotice('已保存版本 v' + (result.data.snapshotVersion ?? result.data.version) + (note.trim() ? '：' + note.trim() : '') + '；线上版本不变，可在下方「版本管理」查看或回滚。');
    } catch (reason) {
      setError(reason.status === 409 ? '云端草稿已被更新，请先重新读取草稿再保存版本。' : reason.message || '保存版本失败');
    } finally { setBusy(false); }
  };
  // 发布：先把未保存的改动落盘，再把 HTML/CSS 快照固化为访客可见版本。
  // 每次重排页面后都刷新图层名与展开状态，图层面板才可读
  const refreshLayers = () => { const editor = editorRef.current; if (editor) nameLayers(editor); };
  // 按文本层把中文稿渲染成英/德快照：一套版式，三份语言输出
  // 译文采用「内容 ID → {src, dst}」结构。旧草稿是 {中文原文: 译文}，读入时自动升级：
  // 快照 HTML 没变，所以每个旧 key 都能反查到唯一 ID，译文不会丢。
  // 升级后必须置 dirty，否则用户不点保存就发布，云端还是旧格式。
  const adoptTranslations = (editor, raw) => {
    const source = { en: raw?.en || {}, de: raw?.de || {} };
    const { translations: migrated, stats } = migrateLegacyTranslations(editor.getHtml(), source);
    setTranslations(migrated);
    return stats;
  };
  const buildLocalesFrom = dict => {
    const editor = editorRef.current;
    if (!editor) return {};
    const html = editor.getHtml(), css = editor.getCss(), out = {};
    for (const code of ['en', 'de']) {
      const table = dict[code] || {};
      if (!Object.keys(table).length) continue;
      out[code] = { html: translateHtml(html, table), css };
    }
    return out;
  };
  const buildLocales = () => buildLocalesFrom(translations);

  // 自动补齐缺失译文。三条规则：
  // 1. 同一句原文出现多处时只送引擎一次，结果分发到所有同文 ID —— 239 条里
  //    有大量重复（「ALSVID」出现 6 次），逐条送会白花一倍成本和时间。
  // 2. 只补「没有译文」或「原文已改需更新」的条目，状态正常的译文一律不覆盖。
  // 3. 引擎失败不抛错，返回原译文 + 说明，由调用方决定是否继续发布。
  const fillTranslationsFromEngine = async () => {
    const status = (await api.layoutTranslateStatus()).data || {};
    if (!status.ready) return { next: translations, added: 0, note: '未配置翻译引擎，本次未自动翻译。' };

    const unique = [...new Set(strings.map(item => item.text))];
    // 服务端按「原文」判断是否已有译文，这里要把 ID 结构折叠回原文键
    const existingByText = { en: {}, de: {} };
    for (const code of ['en', 'de']) {
      for (const item of strings) {
        if (entryStatus(translations[code], item) !== 'ok') continue;
        const value = translationValue(translations[code], item.id, item.text);
        if (value) existingByText[code][item.text] = value;
      }
    }

    const response = await api.autoTranslateLayout({ strings: unique, targets: ['en', 'de'], existing: existingByText });
    const data = response.data || {}, incoming = data.translations || {}, stats = data.stats || {};
    const next = { en: { ...(translations.en || {}) }, de: { ...(translations.de || {}) } };
    let added = 0;
    for (const code of ['en', 'de']) {
      for (const item of strings) {
        const dst = incoming[code]?.[item.text];
        if (!dst) continue;
        // 双保险：状态正常的译文绝不覆盖，只填缺失或已过期的
        if (entryStatus(next[code], item) === 'ok') continue;
        next[code][item.id] = { src: item.text, dst };
        added += 1;
      }
    }
    const note = added
      ? '已自动补齐 ' + added + ' 条译文（引擎 ' + (data.provider || 'unknown') + '）' + (stats.failed ? '，' + stats.failed + ' 条失败保留中文' : '') + '。'
      : (stats.failed ? '自动翻译失败 ' + stats.failed + ' 条，已保留中文。' : '没有需要补齐的条目。');
    return { next, added, note, provider: data.provider };
  };

  // 面板上的手动按钮：先翻完、自己看一遍，再决定发不发
  const autoTranslateMissing = async () => {
    if (busy || !strings.length) return;
    setBusy(true); setError('');
    try {
      const status = (await api.layoutTranslateStatus()).data || {};
      if (!status.ready) { setError('未配置翻译引擎：请在 8089 环境配置 TRANSLATE_PROVIDER 与对应密钥。'); return; }
      if (status.placeholder && !window.confirm('当前是占位引擎（mock），译文会形如「[DE] 原文」，只用于验证链路。继续吗？')) return;
      const result = await fillTranslationsFromEngine();
      if (result.added) { setTranslations(result.next); setDirty(true); }
      setNotice(result.note);
    } catch (reason) { setError('自动翻译失败：' + (reason.message || '未知原因')); }
    finally { setBusy(false); }
  };

  const publishLayout = async () => {
    const editor = editorRef.current;
    if (!editor || busy || version === null) return;

    // 自动补齐放在发布之前而不是之后：上线那一刻就是完整三语，
    // 不出现「先给访客看中文、过一会才变成德语」的窗口期。
    let merged = translations, autoNote = '';
    const missing = strings.filter(item => ['en', 'de'].some(code => entryStatus(translations[code], item) !== 'ok')).length;
    if (missing) {
      let status = null;
      try { status = (await api.layoutTranslateStatus()).data; } catch (_) { status = null; }
      const engine = status?.ready ? (status.placeholder ? '占位引擎 mock' : status.provider) : '未配置';
      const hint = status?.placeholder
        ? '\n\n注意：当前是占位引擎，译文会形如「[DE] 原文」，只用于验证链路，不要直接发布给访客。'
        : '';
      if (window.confirm('还有 ' + missing + ' 条文案缺译文或原文已改。\n\n先用自动翻译补齐再发布吗？\n· 引擎：' + engine + '\n· 只补空缺与过期条目，正常译文不会被覆盖' + hint)) {
        setBusy(true); setError('');
        try {
          const result = await fillTranslationsFromEngine();
          if (result.added) { merged = result.next; setTranslations(result.next); }
          autoNote = result.note;
        } catch (reason) {
          // 翻译失败绝不阻塞发布：按现有译文发布，缺的仍是中文 + 待翻译标记
          autoNote = '自动翻译失败（' + (reason.message || '未知原因') + '），本次按现有译文发布。';
        } finally { setBusy(false); }
      }
    }

    const locales = buildLocalesFrom(merged), codes = Object.keys(locales);
    const summary = codes.length
      ? '英文覆盖 ' + coverageOf(strings, merged.en) + '%，德文覆盖 ' + coverageOf(strings, merged.de) + '%。' + (autoNote ? '\n' + autoNote : '')
      : '本次只发布中文首页；未纳入本次的语言保留当前正式版本（尚未发布的语言仍使用系统默认模板）。';
    if (!window.confirm('发布后，访客打开官网首页会立即看到当前装修效果。\n' + summary + '\n确定发布？')) return;
    setBusy(true); setError('');
    try {
      let current = version;
      // 自动补齐改动了 translations，即使画布没动也必须落库，
      // 否则发布用的是新译文、云端草稿还是旧的，下次读取会「退回」未翻译状态
      if (dirty || merged !== translations) {
        const saved = await api.saveStorefrontLayoutDraft({ ...pageSnapshot(), translations: merged, expectedVersion: current });
        current = saved.data.version;
        setVersion(current); setDirty(false);
      }
      setReleaseReview({scope:'all',body:{expectedVersion:current,html:editor.getHtml(),css:editor.getCss(),locales}});
    } catch (reason) {
      setError(reason.status === 409 ? '云端草稿已被其他人更新，请先重新读取再发布。' : reason.message || '发布失败');
    } finally { setBusy(false); }
  };
  // 单语言发布：只替换这一种语言的线上快照，中文/另一种语言完全不受影响。
  // 与「全部发布」的区别是版本、时间、门禁都按语言算——德文没翻完也能先上英文。
  const publishLocale = async code => {
    const editor = editorRef.current;
    if (!editor || busy || version === null) return;
    const label = code === 'zh' ? '中文' : (code === 'en' ? '英文' : '德文');
    let table = translations[code] || {};
    if (code !== 'zh' && !Object.keys(table).length) {
      setError(label + '还没有任何译文，先在翻译面板补齐再发布。');
      return;
    }

    // 发布前先补齐：上线那一刻就是完整的，不留「先看中文、过一会变外语」的窗口
    let merged = translations, autoNote = '';
    const pending = code === 'zh' ? [] : strings.filter(item => entryStatus(table, item) !== 'ok');
    if (pending.length) {
      let status = null;
      try { status = (await api.layoutTranslateStatus()).data; } catch (_) { status = null; }
      const engine = status?.ready ? (status.placeholder ? '占位引擎 mock' : status.provider) : '未配置';
      if (window.confirm(label + '还有 ' + pending.length + ' 条文案缺译文或原文已改。\n\n先用自动翻译补齐再发布吗？\n· 引擎：' + engine + '\n· 只补空缺与过期条目，正常译文不会被覆盖')) {
        setBusy(true); setError('');
        try {
          const result = await fillTranslationsFromEngine();
          if (result.added) { merged = result.next; table = result.next[code] || {}; setTranslations(result.next); }
          autoNote = result.note;
        } catch (reason) {
          autoNote = '自动翻译失败（' + (reason.message || '未知原因') + '），按现有译文继续。';
        } finally { setBusy(false); }
      }
    }

    const coverage = code === 'zh' ? 100 : coverageOf(strings, table);
    const force=code!=='zh'&&coverage<100&&window.confirm(label+'覆盖率 '+coverage+'%，仍有未翻译内容。预览后强制发布，未翻译处保留中文。继续吗？');
    if(code!=='zh'&&coverage<100&&!force)return;

    setBusy(true); setError('');
    try {
      // 译文改了但画布没动也必须先落库，否则下次读取草稿会退回旧译文
      let current = version;
      if (dirty || merged !== translations) {
        const saved = await api.saveStorefrontLayoutDraft({ ...pageSnapshot(), translations: merged, expectedVersion: current });
        current = saved.data.version;
        setVersion(current); setDirty(false);
      }
      const payload = { html: translateHtml(editor.getHtml(), table), css: editor.getCss(), expectedVersion: current, force };
      setReleaseReview({scope:code,body:payload,label,coverage,autoNote});
    } catch (reason) {
      setError(reason.status === 409 ? '云端草稿已被其他人更新，请先重新读取再发布。' : (reason.message || '发布失败'));
    } finally { setBusy(false); }
  };

  const unpublishLocale = async code => {
    if (busy) return;
    const label = code === 'en' ? '英文' : '德文';
    if (!window.confirm('下线' + label + '首页后，访客打开 /www/' + code + ' 会回到系统默认模板（中文首页不受影响）。确定下线？')) return;
    setBusy(true); setError('');
    try {
      await api.unpublishStorefrontLocale({ locale: code });
      await refreshLocaleStatus();
      setNotice('已下线' + label + '首页，中文首页未受影响。');
    } catch (reason) {
      setError(reason.message || '下线失败');
    } finally { setBusy(false); }
  };
  // 补推：把「当前线上快照」再同步一次生产站（发布时推送失败可用）
  const retryProductionSync = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.syncLayoutProduction();
      const sync = result.data || {};
      if (sync.ok) setNotice('已把当前线上版式重新同步到 www.alsvidbike.com（线上版本 v' + (sync.productionVersion ?? '—') + '，用时 ' + (sync.ms ?? 0) + 'ms）。');
      else setError(sync.reason || '同步线上失败');
    } catch (reason) { setError(reason.message || '同步线上失败'); }
    finally { setBusy(false); }
  };
  // 补刷新站 8091 缓存：发布时刷新失败（新站重启、网络抖动）用它重试，只影响缓存不改版本
  const retryStorefrontRevalidate = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.refreshLayoutStorefront();
      const refresh = result.data || {};
      if (refresh.ok) setNotice('新站商城缓存已刷新（用时 ' + (refresh.ms ?? 0) + 'ms），访客现在看到的就是线上版本 v' + (publishedVersion ?? '—') + '。');
      else if (refresh.skipped) setError('未配置新站刷新：' + (refresh.reason || '缺少 ALSVID_STOREFRONT_ORIGIN 或 ALSVID_REVALIDATE_TOKEN'));
      else setError('新站缓存刷新仍然失败：' + (refresh.reason || '未知原因'));
    } catch (reason) { setError(reason.message || '新站缓存刷新失败'); }
    finally { setBusy(false); }
  };
  const unpublishLayout = async () => {
    if (busy || !window.confirm('撤回发布后，官网首页回到系统默认版式。确定撤回？')) return;
    setBusy(true); setError('');
    try {
      const result = await api.unpublishStorefrontLayout();
      setPublishedVersion(null); setPublishedAt('');
      const refresh = result?.data?.storefrontRevalidate;
      const refreshNote = !refresh ? '' : refresh.ok ? '新站商城已同步回默认版式。' : refresh.skipped ? '（未配置新站刷新，缓存最多 1 小时后自然过期）' : '（新站刷新失败，可用「重试刷新新站」补刷）';
      setNotice('已撤回发布，本系统官网首页回到默认版式；装修草稿仍在。' + refreshNote);
    } catch (reason) { setError(reason.message || '撤回发布失败'); }
    finally { setBusy(false); }
  };
  const exportProject = () => { const editor = editorRef.current; if (!editor) return; downloadText('alsvid-storefront-layout.json', JSON.stringify(editor.getProjectData(), null, 2), 'application/json;charset=utf-8'); setNotice('装修方案已导出为 JSON 文件。'); };
  const exportHtml = () => { const editor = editorRef.current; if (!editor) return; const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALSVID 商城装修预览</title><style>' + editor.getCss() + '</style></head><body>' + editor.getHtml() + '</body></html>'; downloadText('alsvid-storefront-preview.html', html, 'text/html;charset=utf-8'); setNotice('静态 HTML 预览已导出，不会自动发布到官网。'); };
  const importProject = async event => {
    const input = event.currentTarget, file = input.files?.[0], editor = editorRef.current;
    if (!file || !editor) return;
    try { const value = JSON.parse(await file.text()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('方案格式无效'); importedRef.current = false; editor.loadProjectData(value); ensureMotionCss(editor); setMotionEffects(motionIds(editor)); setDirty(true); setNotice('装修方案已导入，请保存到云端。'); }
    catch { setError('导入失败：请选择本装修器导出的有效 JSON 方案文件。'); }
    finally { input.value = ''; }
  };
  // 反向构建数据源：优先官网已发布商品，没有则回退到产品主档（仍在启用状态的）。
  const shopItems = (products.length
    ? products.map(product => ({
        id: product.id,
        title: product.titles[productLocale] || product.titles.zh || product.titles.en || product.titles.de || product.id,
        model: product.model,
        image: product.images[productLocale] || product.images.zh || product.images.en || product.images.de || '',
        kind: product.kind,
        published: true,
      }))
    : registry.map(product => ({
        id: product.id,
        title: product.name,
        model: product.model,
        image: (product.images || [])[0] ? '/api/products/' + encodeURIComponent(product.id) + '/media/' + encodeURIComponent(product.images[0].id) : (product.coverImage?.url || ''),
        kind: product.kind,
        published: false,
      }))).slice(0, 12);
  // 云端还没有草稿时，进入装修器直接用现有商品反向生成一版首页，省掉从空白开始的步骤。
  const autoFilled = useRef(false);
  useEffect(() => {
    if (autoFilled.current || !ready || version !== 0 || dirty || registryState === 'loading') return;
    const editor = editorRef.current;
    if (!editor) return;
    autoFilled.current = true;
    if (!shopItems.length) { setNotice('云端尚无装修草稿，且没有可用商品；可先在产品模块建档。'); return; }
    importedRef.current = false; editor.setComponents(homepageWith(shopItems));
    editor.setStyle(INITIAL_CSS);
    refreshLayers();
    setDirty(true);
    setNotice('云端尚无装修草稿：已按 ' + shopItems.length + ' 个商品反向生成首页草稿，确认后点「发布到官网首页」。');
  }, [ready, version, dirty, registryState, products.length, registry.length, productLocale]);

  // 在新站（8091）里预览草稿：走 Draft Mode，看到的是真实商城的渲染结果，
  // 而不是把编辑器 HTML 塞进空白页 —— 后者无法反映语言快照、商品卡片注入与 CSS 作用域。
  // 必须先在点击栈里开窗，再异步换地址，否则会被拦弹窗。
  const previewOnStorefront = async () => {
    if (busy) return;
    const win = window.open('', '_blank');
    if (!win) { setNotice('浏览器拦截了新标签：请允许本站弹窗后重试。'); return; }
    win.document.write('<p style="font-family:Arial;padding:24px">正在生成预览链接…</p>');
    setBusy(true); setError('');
    try {
      const result = await api.layoutPreviewToken(lang === 'en' ? 'en' : lang === 'de' ? 'de' : 'zh');
      // 新站地址由后端配置给出（ALSVID_STOREFRONT_PUBLIC_ORIGIN），不在前端写死端口。
      // 迁到 Hetzner 时只改部署环境变量，前端不用重新构建。
      const status = await api.layoutStorefrontRevalidateStatus();
      const base = String(status?.data?.storefrontPublicOrigin || '').replace(/\/+$/, '');
      if (!base) throw new Error('未配置新站地址：请在 8089 设置 ALSVID_STOREFRONT_PUBLIC_ORIGIN');
      win.location.replace(base + '/api/preview?token=' + encodeURIComponent(result.data.token) + '&locale=' + encodeURIComponent(result.data.locale));
    } catch (reason) {
      win.close();
      setError(reason.status === 503
        ? '新站预览未配置：需要在 8089 设置 ALSVID_PREVIEW_SECRET（至少 32 字节）后重试。'
        : (reason.message || '生成预览链接失败'));
    } finally { setBusy(false); }
  };
  // 预览：用编辑器**当前**内容（不需要先保存）生成一份完整 HTML，在新标签打开成品页面。
  // 之前是跳 /www/zh?draft=1，读的是云端已保存草稿，未保存的改动看不到，所以不像「成稿」。
  const openPreview = () => {
    const editor = editorRef.current;
    if (!editor) return;
    ensureMotionCss(editor);
    const docLang = lang === 'de' ? 'de' : lang === 'en' ? 'en' : 'zh-CN';
    const doc = '<!doctype html><html lang="' + docLang + '"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      // base 指向本系统，装修内容里的相对路径（素材库图片等）才能正确解析
      + '<base href="' + window.location.origin + '/">'
      + '<title>ALSVID 官网首页 · 预览</title><style>' + editor.getCss() + '</style></head><body>'
      + editor.getHtml() + '</body></html>';
    // 必须在用户点击的同步调用栈里先开窗（异步会被当弹窗拦截）。
    // 先开空白页再 document.write，避免 blob: URL 在脚本打开的独立窗口里被浏览器安全策略拦掉。
    const previewWin = window.open('', '_blank');
    if (!previewWin) { setNotice('浏览器拦截了新标签：请允许本站弹窗后重试。'); return; }
    try {
      previewWin.document.open();
      previewWin.document.write(doc);
      previewWin.document.close();
      setNotice('已在新标签打开当前装修内容的成品预览（未发布，不影响线上）。');
    } catch (_) {
      // document.write 受限时退回 blob URL
      const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }));
      previewWin.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice('已在新标签打开当前装修内容的成品预览（未发布，不影响线上）。');
    }
  };
  const toggleMotionEffect = id => {
    const editor = editorRef.current;
    if (!editor || lang !== 'zh' || preview) return;
    const next = motionEffects.includes(id) ? motionEffects.filter(value => value !== id) : [...motionEffects, id];
    ensureMotionCss(editor);
    syncMotionIds(editor, next);
    setMotionEffects(next);
    setDirty(true);
    setNotice('交互动效已更新；保存草稿后保留，发布后访客可见。');
  };
  const clearMotionEffects = () => {
    const editor = editorRef.current;
    if (!editor) return;
    syncMotionIds(editor, []);
    setMotionEffects([]);
    setDirty(true);
    setNotice('已清除全部交互动效；保存草稿后保留。');
  };
  const resetExample = () => { const editor = editorRef.current; if (!editor) return; if (dirty && !window.confirm('恢复示例将替换当前编辑内容，确定继续？')) return; importedRef.current = false; editor.setComponents(INITIAL_HTML); editor.setStyle(INITIAL_CSS + '\n.alsvid-storefront{--alsvid-motion-library:1}\n' + MOTION_CSS); setMotionEffects([]); refreshLayers(); setDirty(true); setNotice('已恢复初始商城模板，请保存后保留本次更改。'); };
  /* ---------- 翻译文本层 ---------- */
  // 译文以内容 ID 为键，并保留 src（写入时的中文原文）：
  // 中文改动后 src 与当前原文不一致 → 该条判为「需要更新」。旧译文不删除，
  // 既不会把过期译文当成正确内容发布，也不会丢掉已经翻好的文字。
  const setTranslation = (entry, value) => {
    const text = String(value == null ? '' : value);
    setTranslations(current => {
      const table = { ...(current[i18nLang] || {}) };
      if (!text.trim()) delete table[entry.id];
      else table[entry.id] = { src: entry.text, dst: text };
      return { ...current, [i18nLang]: table };
    });
    setDirty(true);
  };
  const dropTranslation = id => {
    setTranslations(current => { const next = { ...(current[i18nLang] || {}) }; delete next[id]; return { ...current, [i18nLang]: next }; });
    setDirty(true);
  };
  const switchLang = code => {
    setLang(code);
    if (code !== 'zh') { setI18nLang(code); setLeftTab('i18n'); setNotice(code === 'en' ? '当前是英文只读预览：缺译文的文案用橙色虚线标出。' : '当前是德文只读预览：缺译文的文案用橙色虚线标出。'); }
    else setNotice('已回到中文编辑模式，英德预览不会改动页面结构。');
  };
  const exportTranslationKit = () => {
    const pending = {};
    for (const code of ['en', 'de']) {
      pending[code] = strings.filter(item => entryStatus(translations[code], item) !== 'ok').map(item => ({ id: item.id, text: item.text }));
    }
    downloadText('alsvid-storefront-i18n.json', JSON.stringify({
      note: '按 entries 里的 id 逐条翻译，填进 translations 的同名 id（值可写纯字符串，也可写 {src,dst}）。原样导入即可。',
      source: 'zh',
      entries: strings.map(item => ({ id: item.id, kind: item.kind, attr: item.attr || null, text: item.text })),
      pending,
      translations,
    }, null, 2), 'application/json;charset=utf-8');
    setNotice('已导出 ' + strings.length + ' 条文案（英文待处理 ' + pending.en.length + ' 条、德文 ' + pending.de.length + ' 条）与现有译文；翻译完成后原样导入即可。');
  };
  const importTranslations = async event => {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const table = value?.translations && typeof value.translations === 'object' ? value.translations : value;
      const byId = new Map(strings.map(item => [item.id, item]));
      // 旧文件可能还是「中文原文当键」，按原文反查并分发到所有同文 ID
      const byText = new Map();
      for (const item of strings) {
        if (!byText.has(item.text)) byText.set(item.text, []);
        byText.get(item.text).push(item);
      }
      const next = { en: { ...(translations.en || {}) }, de: { ...(translations.de || {}) } };
      let added = 0, orphaned = 0;
      for (const code of ['en', 'de']) {
        const source = table?.[code];
        if (!source || typeof source !== 'object') continue;
        for (const [key, val] of Object.entries(source)) {
          const dst = typeof val === 'string' ? val : (val && typeof val === 'object' ? String(val.dst || '') : '');
          if (!String(key).trim() || !dst.trim()) continue;
          const entry = byId.get(key);
          if (entry) { next[code][entry.id] = { src: entry.text, dst: dst.trim() }; added += 1; continue; }
          const sameText = byText.get(String(key).trim());
          if (sameText) { for (const item of sameText) { next[code][item.id] = { src: item.text, dst: dst.trim() }; added += 1; } continue; }
          orphaned += 1;
        }
      }
      if (!added) throw new Error('empty');
      setTranslations(next); setDirty(true);
      setNotice('已导入 ' + added + ' 条译文' + (orphaned ? '，' + orphaned + ' 条找不到对应位置已跳过' : '') + '；可在左侧「翻译」面板逐条核对，保存草稿后生效。');
    } catch {
      setError('导入失败：请选择本装修器导出的 i18n JSON，或形如 {"en":{"内容ID":"译文"},"de":{…}} 的映射文件。');
    } finally { input.value = ''; }
  };
  const clearLanguage = () => {
    if (!window.confirm('清空当前语言的译文？中文原稿不受影响。')) return;
    setTranslations(current => ({ ...current, [i18nLang]: {} }));
    setDirty(true);
    setNotice('已清空该语言译文。');
  };

  /* ---------- 图层交互 ---------- */
  const layerAction = action => {
    const editor = editorRef.current, comp = editor?.getSelected();
    if (!editor || !comp) { setNotice('请先在左侧图层列表或画布中选中一个元素。'); return; }
    const parent = comp.parent();
    if (action === 'up' || action === 'down') {
      if (!parent) return;
      const siblings = parent.components(), index = siblings.indexOf(comp);
      const target = action === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= siblings.length) { setNotice('已经到边界了，无法继续移动。'); return; }
      // down 传 index+2 是因为 grapesjs 在“向后移动”时会自动回退一位
      comp.move(parent, { at: action === 'up' ? index - 1 : index + 2 });
      setDirty(true); setNotice('已调整图层顺序。');
      return;
    }
    if (action === 'rename') {
      const next = window.prompt('图层名称（只影响图层列表，不改页面内容）', comp.getName() || '');
      if (next === null) return;
      const label = String(next).trim().slice(0, 60);
      if (typeof comp.setName === 'function') comp.setName(label); else comp.set('custom-name', label);
      setDirty(true); setNotice('图层已重命名为「' + (label || '默认名') + '」。');
      return;
    }
    if (action === 'duplicate') {
      editor.runCommand('core:copy');
      editor.runCommand('core:paste');
      setDirty(true); setNotice('已复制所选图层（可撤销）。');
      return;
    }
    if (action === 'remove') {
      if (comp.get('removable') === false) { setNotice('这个元素受保护，不能删除。'); return; }
      comp.remove();
      setDirty(true); setNotice('已删除该图层（可撤销）。');
      return;
    }
    if (action === 'toggle') {
      const style = { ...comp.getStyle() };
      const hidden = style.display === 'none';
      comp.setStyle({ ...style, display: hidden ? '' : 'none' });
      setDirty(true); setNotice(hidden ? '已显示该图层。' : '已隐藏该图层（导出时仍保留结构）。');
    }
  };

  if (user?.role !== 'admin') return null;

  return <section className="storefront-editor" aria-label="商城网页装修">
    <header className="storefront-editor__header"><div><p className="storefront-editor__eyebrow">ALSVID 商城装修工作台</p><h2 /><p>拖拽模块、编辑文字图片和样式。保存后写入 V2 云端草稿，可回读继续修改。</p></div>
      <div className="storefront-editor__actions">
        <div className="storefront-editor__actiongroup">
          <button className="btn" type="button" onClick={loadDraft} disabled={!ready || busy}>读取草稿</button>
          <button className="btn" type="button" onClick={() => saveDraft()} disabled={!ready || busy || version === null}>{busy ? '保存中…' : '保存草稿'}</button>
          <button className="btn" type="button" onClick={saveVersion} disabled={!ready || busy || version === null} title="留一份可回滚的快照，不影响线上版本">保存版本</button>
        </div>
        <div className="storefront-editor__actiongroup">
          <button className="btn primary" type="button" onClick={publishLayout} disabled={!ready || busy || version === null}>发布到官网首页</button>
          <button className="btn" type="button" onClick={unpublishLayout} disabled={!ready || busy || !publishedVersion}>撤回发布</button>
          <button className="btn" type="button" onClick={previewOnStorefront} disabled={busy} title="在新站 8091 以草稿态打开，看到的是真实商城渲染结果">新站预览</button>
          <button className="btn" type="button" onClick={() => setShowVersions((current) => !current)} aria-expanded={showVersions}>{showVersions ? '收起版本' : '版本管理'}</button>
        </div>
        <div className="storefront-editor__actiongroup">
          <details className="storefront-editor__menu">
            <summary className="btn">导入 / 导出</summary>
            <div className="storefront-editor__menuitems">
              <button className="btn" type="button" onClick={() => fileRef.current?.click()} disabled={!ready}>导入装修方案</button>
              <button className="btn" type="button" onClick={exportHtml} disabled={!ready}>导出 HTML</button>
              <button className="btn" type="button" onClick={exportProject} disabled={!ready}>导出装修方案</button>
              <button className="btn" type="button" onClick={resetExample} disabled={!ready}>恢复示例版式</button>
              <button className="btn" type="button" onClick={retryProductionSync} disabled={busy || !publishedVersion}>重试同步线上</button>
              <button className="btn" type="button" onClick={retryStorefrontRevalidate} disabled={busy || !publishedVersion} title="只刷新新站 8091 的缓存，不改变已发布版本">重试刷新新站</button>
            </div>
          </details>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importProject} />
        </div>
        {onClose && <div className="storefront-editor__actiongroup">
          <button className="btn" type="button" onClick={exitWithoutSaving} disabled={busy} title="丢弃本次未保存修改并关闭窗口">退出不保存</button>
          <button className="btn primary" type="button" onClick={saveAndExit} disabled={!ready || busy || version === null} title="先保存草稿，成功后再关闭窗口">保存退出</button>
        </div>}
      </div>
    </header>
    <div className="storefront-editor__notice"><strong>云端草稿</strong><span>{publishedVersion ? '官网首页正在展示已发布版本 v' + publishedVersion + (publishedAt ? '（' + String(publishedAt).slice(0, 16).replace('T', ' ') + '）' : '') + '，草稿改动需重新发布才生效。' : '官网首页当前是系统默认版式；点击「发布到官网首页」后才会展示装修效果。'}{syncStatus?.configured ? '发布后会同步到线上 www.alsvidbike.com。' : '当前未配置生产同步，发布只影响本系统官网前台，线上 www.alsvidbike.com 不会变化。'}</span><a className="storefront-editor__view" href="/www/zh" target="_blank" rel="noreferrer">查看前台首页 ↗</a><span className="storefront-editor__status">{dirty ? '有未保存修改' : version === null ? '正在读取' : '草稿 v' + version}{publishedVersion ? ' · 已发布 v' + publishedVersion : ' · 未发布'}</span></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {showVersions && <div style={{ padding: '0 16px 16px' }}>
      <StorefrontLayoutVersions
        currentVersion={publishedVersion}
        onRolledBack={(data) => {
          // 回滚后线上版本号变了，顶部提示条的「已发布 vN」必须同步
          setPublishedVersion(data?.publishedVersion ?? null);
          setNotice('已回滚，线上版本变为 v' + (data?.publishedVersion ?? '—') + '。草稿未改动，如需保留回滚后的内容请重新读取草稿。');
        }}
      />
    </div>}
    <div className="storefront-editor__toolbar"><div className="storefront-editor__toolgroup"><button className="btn" type="button" onClick={() => editorRef.current?.runCommand('core:undo')} disabled={!ready}>撤销</button><button className="btn" type="button" onClick={() => editorRef.current?.runCommand('core:redo')} disabled={!ready}>重做</button><span className="hint" /></div><div className="storefront-editor__toolgroup storefront-editor__langbar" role="group" aria-label="编辑语言">{[...LAYOUT_LANGS].map(([code, label]) => <button className={'btn' + (lang === code ? ' primary' : '')} type="button" key={code} disabled={!ready} onClick={() => switchLang(code)}>{code === 'zh' ? label + '（编辑）' : label}</button>)}<span className="hint" /></div><div className="storefront-editor__toolgroup">{['桌面端', '平板端', '手机端'].map(name => <button className={'btn' + (device === name ? ' primary' : '')} type="button" key={name} disabled={!ready} onClick={() => { editorRef.current?.setDevice(name); setDevice(name);  }}>{name}</button>)}<button className="btn" type="button" onClick={openPreview} disabled={!ready}>预览页面</button></div></div>
    <div className="storefront-editor__layout">
      <aside className="storefront-editor__left"><div className="storefront-editor__panelhead"><strong>页面结构</strong><span>拖拽添加</span></div><div className="storefront-editor__tabs"><button className={leftTab === 'blocks' ? 'active' : ''} type="button" onClick={() => setLeftTab('blocks')}>模块库</button><button className={leftTab === 'layers' ? 'active' : ''} type="button" onClick={() => setLeftTab('layers')}>图层</button><button className={leftTab === 'motion' ? 'active' : ''} type="button" onClick={() => setLeftTab('motion')}>交互动效</button><button className={leftTab === 'i18n' ? 'active' : ''} type="button" onClick={() => setLeftTab('i18n')}>翻译</button></div>
        {leftTab === 'layers' && <div className="storefront-editor__layertool">
          <button className="btn" type="button" onClick={() => layerAction('rename')}>重命名</button>
          <button className="btn" type="button" onClick={() => layerAction('up')}>上移</button>
          <button className="btn" type="button" onClick={() => layerAction('down')}>下移</button>
          <button className="btn" type="button" onClick={() => layerAction('duplicate')}>复制</button>
          <button className="btn" type="button" onClick={() => layerAction('toggle')}>显隐</button>
          <button className="btn" type="button" onClick={() => layerAction('remove')}>删除</button>
          <span className="hint" />
        </div>}
        <div className="storefront-editor__blocks" ref={blocksRef} style={{ display: leftTab === 'blocks' ? 'block' : 'none' }} /><div className="storefront-editor__layers" ref={layersRef} style={{ display: leftTab === 'layers' ? 'block' : 'none' }} />
        {leftTab === 'motion' && <div className="storefront-editor__motions">
          <div className="storefront-editor__motion-summary"><strong>{motionEffects.length} 项已选</strong><button className="storefront-editor__drop" type="button" disabled={!motionEffects.length || !ready || lang !== 'zh' || preview} onClick={clearMotionEffects}>清空</button></div>
          <p className="storefront-editor__motion-hint">勾选后可在中间画布预览。保存为草稿后会保留选择，正式发布后访客才能看到。</p>
          {[...new Set(MOTION_OPTIONS.map(option => option.group))].map(group => <section className="storefront-editor__motion-group" key={group}><h4>{group}</h4>{MOTION_OPTIONS.filter(option => option.group === group).map(option => <label className="storefront-editor__motion-option" key={option.id}><input type="checkbox" checked={motionEffects.includes(option.id)} disabled={!ready || lang !== 'zh' || preview} onChange={() => toggleMotionEffect(option.id)} /><span><strong>{option.name}</strong><small>{option.note}</small></span></label>)}</section>)}
          <p className="storefront-editor__motion-foot">动效遵循访客设备的“减少动态效果”设置。带有组件条件的效果需在页面中加入对应组件或标记后显示。</p>
        </div>}
        {leftTab === 'i18n' && <div className="storefront-editor__i18n">
          <div className="storefront-editor__i18nhead">
            {['en', 'de'].map(code => <button key={code} className={'btn' + (i18nLang === code ? ' primary' : '')} type="button" onClick={() => { setI18nLang(code); setLang(code); }}>{code === 'en' ? 'English' : 'Deutsch'}</button>)}
            <span className="storefront-editor__cov">覆盖 {coverageOf(strings, translations[i18nLang])}%</span>
          </div>
          <div className="storefront-editor__i18nactions">
            <button className="btn primary" type="button" onClick={autoTranslateMissing} disabled={!strings.length || busy}>自动翻译缺失</button>
            <button className="btn" type="button" onClick={exportTranslationKit} disabled={!strings.length}>导出待翻译清单</button>
            <button className="btn" type="button" onClick={() => i18nFileRef.current?.click()}>导入译文 JSON</button>
            <input ref={i18nFileRef} type="file" accept=".json,application/json" hidden onChange={importTranslations} />
            <button className="btn" type="button" onClick={clearLanguage}>清空本语言</button>
          </div>
          <p className="storefront-editor__i18nhint">中文是唯一原稿；这里只维护「内容 ID → 译文」的文本层，改中文不会让译文失联。自动翻译只补空缺和已过期的条目，正常译文不会被覆盖。右上角切到 English / Deutsch 可预览效果。</p>
          <div className="storefront-editor__localepub">
            {['zh', 'en', 'de'].map(code => {
              const label = code === 'zh' ? '中文' : (code === 'en' ? 'English' : 'Deutsch');
              const info = localeStatus?.[code];
              const cov = code === 'zh' ? 100 : coverageOf(strings, translations[code]);
              const live = Boolean(info?.published);
              return <div className="storefront-editor__localerow" key={code}>
                <div className="storefront-editor__localemeta">
                  <strong>{label}</strong>
                  <span className={live ? 'is-live' : ''}>{live ? '线上 v' + (info.version ?? '—') : '未发布'}</span>
                  {code !== 'zh' && <span className={cov === 100 ? 'is-live' : 'is-warn'}>覆盖 {cov}%</span>}
                </div>
                <div className="storefront-editor__localebtns">
                  <button className="btn" type="button" disabled={busy || !ready || (code !== 'zh' && cov === 0)} onClick={() => publishLocale(code)}>{live ? '重新发布' : '发布'}</button>
                  {code !== 'zh' && live && <button className="btn" type="button" disabled={busy} onClick={() => unpublishLocale(code)}>下线</button>}
                </div>
              </div>;
            })}
            <p className="storefront-editor__localefoot">每种语言各自上线：发英文不会动德文，也不会动中文。还有未翻译文案时服务端会拦下，确认后才能强制发布（未翻译处保留中文）。</p>
          </div>
          {!strings.length && <p className="hint" />}
          <ol className="storefront-editor__i18nlist">
            {strings.map(item => {
              const dict = translations[i18nLang];
              const value = translationValue(dict, item.id, item.text);
              const status = entryStatus(dict, item);
              return <li key={item.id} className={status === 'ok' ? 'is-done' : (status === 'needs-update' ? 'is-stale' : '')}>
                <div className="storefront-editor__srctext" title={item.text}>{item.text}{item.kind === 'attr' && <em>{item.attr}</em>}</div>
                <textarea rows={2} value={value} placeholder={i18nLang === 'en' ? 'English translation…' : 'Deutsche Übersetzung…'} onChange={event => setTranslation(item, event.target.value)} />
                {status === 'needs-update' && <span className="storefront-editor__stale">原文已改，请确认译文</span>}
                {value && <button className="storefront-editor__drop" type="button" onClick={() => dropTranslation(item.id)}>清除</button>}
              </li>;
            })}
          </ol>
        </div>}
      </aside>
      <main className="storefront-editor__canvas-panel"><div className="storefront-editor__caption"><span>{lang === 'zh' ? '页面预览' : (lang === 'en' ? 'English 预览' : 'Deutsch 预览')}</span><span>{lang === 'zh' ? '选中元素后可直接编辑' : '只读预览 · 中文原稿不会被改动'}</span></div><div className="storefront-editor__canvas" data-loading={!ready} aria-busy={!ready} ref={canvasRef} style={{ pointerEvents: ready ? '' : 'none' }} />
        {lang !== 'zh' && <div className="storefront-editor__langframe"><iframe title={lang + ' 语言预览'} srcDoc={langDoc} /></div>}
      </main>
      <aside className="storefront-editor__right"><div className="storefront-editor__panelhead"><strong>样式设置</strong><span>选中元素后编辑</span></div><div className="storefront-editor__styles" ref={stylesRef} /></aside>
    </div>
    <p className="storefront-editor__footer" role="status">{notice}</p>
    {releaseReview&&<StorefrontLayoutReleaseReview request={releaseReview} onClose={()=>setReleaseReview(null)} onPublished={async data=>{setPublishedVersion(data.publishedVersion);setPublishedAt(data.publishedAt||'');setReleaseReview(null);if(releaseReview.scope!=='all')await refreshLocaleStatus();setNotice(releaseReview.scope==='all'?'发布已完成。'+(data.storefrontRevalidate?.ok?'前台缓存刷新成功。':'前台缓存刷新未确认，请查看发布状态。'):'已发布'+releaseReview.label+'首页（线上 v'+(data.publishedVersion??'—')+'，覆盖率 '+releaseReview.coverage+'%）。'+(releaseReview.autoNote||'')+(data.storefrontRevalidate?.ok?'新站缓存已刷新。':'缓存刷新尚未确认。'))}}/>}
  </section>;
}
