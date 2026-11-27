import React, { useEffect, useState, useMemo } from 'react';
import './asset-workspace-v2.css';

// SVG 图标定义，保证纯净无外部图标库依赖
const Icons = {
  Tree: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M10 6.5h4M6.5 10v7a1 1 0 0 0 1 1H14" />
    </svg>
  ),
  Folder: ({ color = '#2ba265' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Bike: ({ color = '#788981' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L8.5 7.5l5.5-3.5 3 7.5h-5M8.5 7.5H5.5" />
    </svg>
  ),
  Cube: ({ color = '#788981' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Brand: ({ color = '#788981' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  Cert: ({ color = '#788981' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Grid: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  List: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Cloud: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      <polyline points="12 12 12 16 12 12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  ),
  Server: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2ba265" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  Lock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};

// 目录树配置
const DIRECTORIES = [
  { id: 'all', title: '全部资产', desc: '全量已入库正式资产', icon: Icons.Folder, count: 10, defaultActive: true },
  { id: 'a1', title: 'A1', desc: '20寸轻量化折叠电助力', icon: Icons.Bike, count: 2 },
  { id: 'a1-ultra', title: 'A1 Ultra', desc: '20寸全地形宽胎旗舰', icon: Icons.Bike, count: 2 },
  { id: 'l1', title: 'L1', desc: '26寸城市低跨点通勤车', icon: Icons.Bike, count: 1 },
  { id: 'l1-pro', title: 'L1 PRO', desc: '26寸智能长续航旗舰', icon: Icons.Bike, count: 2 },
  { id: 'common', title: '通用素材', desc: '电池/电机/通用零部件', icon: Icons.Cube, count: 1 },
  { id: 'brand', title: '品牌资产', desc: 'ALSVID VI标识/主视觉', icon: Icons.Brand, count: 1 },
  { id: 'cert', title: '证书资料', desc: '德国ABE/欧盟EN15194', icon: Icons.Cert, count: 1 },
];

// 用途选项
const USAGES = [
  { id: 'all', label: '全部用途', count: 10 },
  { id: 'hero', label: '主图', count: 3 },
  { id: 'detail', label: '详情页', count: 1 },
  { id: 'scene', label: '场景图', count: 1 },
  { id: 'transparent', label: '透明底图', count: 3 },
  { id: 'video', label: '视频', count: 1 },
  { id: 'doc', label: '文档', count: 1 },
];

// 来源分类
const SOURCES = [
  { id: 'all', label: '全部来源' },
  { id: 'original', label: '原始素材' },
  { id: 'mall', label: '商城素材' },
  { id: 'marketing', label: '营销素材' },
  { id: 'ai', label: 'AI 生成' },
];

// 初始资产数据
const INITIAL_ASSETS = [
  {
    id: 'ast-01',
    fileName: 'A1 Ultra 旗舰款钛银主视觉图.webp',
    title: 'A1 Ultra 旗舰款钛银主视觉图.webp',
    folder: 'A1 Ultra',
    version: 'v2 生效',
    format: 'WEBP',
    isPrivate: false,
    status: '已发布',
    refCount: 2,
    usage: 'hero',
    source: 'mall',
    previewType: 'bike-vector',
    previewBg: '#ffffff',
    sizeBytes: '2.4 MB',
    dimensions: '3840 × 2160',
    sku: 'ALS-A1U-TI-01',
    r2Key: 'media/a1-ultra-titanium-kv-v2.webp',
  },
  {
    id: 'ast-02',
    fileName: 'A1 折叠通勤版棚拍透明原图.png',
    title: 'A1 折叠通勤版棚拍透明原图.png',
    folder: 'A1',
    version: 'v1 生效',
    format: 'PNG',
    isPrivate: true,
    status: '私有',
    refCount: 0,
    usage: 'transparent',
    source: 'original',
    previewType: 'bike-vector',
    previewBg: 'checkerboard',
    sizeBytes: '4.8 MB',
    dimensions: '3840 × 2160',
    sku: 'ALS-A1-COMMUTE-01',
    r2Key: 'media/private/a1-folded-clean-cutout.png',
  },
  {
    id: 'ast-03',
    fileName: 'A1 折叠机构细节拆解长图.webp',
    title: 'A1 折叠机构细节拆解长图.webp',
    folder: 'A1',
    version: 'v1 生效',
    format: 'WEBP',
    isPrivate: false,
    status: '已发布',
    refCount: 1,
    usage: 'detail',
    source: 'mall',
    previewType: 'bike-vector',
    previewBg: '#ffffff',
    sizeBytes: '1.9 MB',
    dimensions: '1920 × 5800',
    sku: 'ALS-A1-DETAIL-01',
    r2Key: 'media/a1-folding-structure-exploded.webp',
  },
  {
    id: 'ast-04',
    fileName: 'A1 Ultra 欧洲户外探索全景海报.jpg',
    title: 'A1 Ultra 欧洲户外探索全景海报.jpg',
    folder: 'A1 Ultra',
    version: 'v1 生效',
    format: 'JPG',
    isPrivate: false,
    status: '已发布',
    refCount: 3,
    usage: 'scene',
    source: 'marketing',
    previewType: 'scenery',
    previewBg: '#eaf4eb',
    sizeBytes: '3.6 MB',
    dimensions: '3840 × 2160',
    sku: 'ALS-A1U-SCENE-01',
    r2Key: 'media/a1-ultra-europe-adventure.jpg',
  },
  {
    id: 'ast-05',
    fileName: 'L1 城市低跨点通勤版整车图.webp',
    title: 'L1 城市低跨点通勤版整车图.webp',
    folder: 'L1',
    version: 'v1 生效',
    format: 'WEBP',
    isPrivate: false,
    status: '已发布',
    refCount: 1,
    usage: 'hero',
    source: 'mall',
    previewType: 'bike-vector',
    previewBg: '#ffffff',
    sizeBytes: '2.1 MB',
    dimensions: '3840 × 2160',
    sku: 'ALS-L1-URBAN-01',
    r2Key: 'media/l1-low-step-commute.webp',
  },
  {
    id: 'ast-06',
    fileName: 'L1 PRO 曜石黑长续航旗舰主图.webp',
    title: 'L1 PRO 曜石黑长续航旗舰主图.webp',
    folder: 'L1 PRO',
    version: 'v2 生效',
    format: 'WEBP',
    isPrivate: false,
    status: '已发布',
    refCount: 2,
    usage: 'hero',
    source: 'mall',
    previewType: 'bike-vector',
    previewBg: '#ffffff',
    sizeBytes: '2.8 MB',
    dimensions: '3840 × 2160',
    sku: 'ALS-L1P-BLACK-01',
    r2Key: 'media/l1-pro-flagship-black.webp',
  },
  {
    id: 'ast-07',
    fileName: 'A1 Ultra 碳纤维车架实验室应力测试图.webp',
    title: 'A1 Ultra 碳纤维车架实验室应力测试图.webp',
    folder: 'A1 Ultra',
    version: 'v2 生效',
    format: 'WEBP',
    isPrivate: false,
    status: '已发布',
    refCount: 2,
    usage: 'transparent',
    source: 'ai',
    previewType: 'bike-vector',
    previewBg: 'checkerboard',
    sizeBytes: '3.1 MB',
    dimensions: '3840 × 2160',
    sku: 'ALS-A1U-STRESS-01',
    r2Key: 'media/a1-ultra-stress-test-cutout.webp',
  },
  {
    id: 'ast-08',
    fileName: 'ALSVID VI 标识与矢量标准色盘.svg',
    title: 'ALSVID VI 标识与矢量标准色盘.svg',
    folder: '品牌资产',
    version: 'v1 生效',
    format: 'SVG',
    isPrivate: false,
    status: '已发布',
    refCount: 8,
    usage: 'doc',
    source: 'original',
    previewType: 'vector-doc',
    previewBg: '#ffffff',
    sizeBytes: '420 KB',
    dimensions: 'Vector Scalable',
    sku: 'VI-BRAND-GUIDE',
    r2Key: 'media/brand/alsvid-vi-vector.svg',
  },
  {
    id: 'ast-09',
    fileName: '德国 ABE 道路准驾认证证书及铭牌文件.pdf',
    title: '德国 ABE 道路准驾认证证书及铭牌文件.pdf',
    folder: '证书资料',
    version: 'v1 生效',
    format: 'PDF',
    isPrivate: false,
    status: '已发布',
    refCount: 1,
    usage: 'doc',
    source: 'original',
    previewType: 'vector-doc',
    previewBg: '#f8faf9',
    sizeBytes: '1.2 MB',
    dimensions: 'A4 Multi-page',
    sku: 'DOC-DE-ABE-2026',
    r2Key: 'media/cert/germany-abe-approval.pdf',
  },
  {
    id: 'ast-10',
    fileName: 'ALSVID 智能电控系统骑行演示短片.mp4',
    title: 'ALSVID 智能电控系统骑行演示短片.mp4',
    folder: '通用素材',
    version: 'v1 生效',
    format: 'MP4',
    isPrivate: false,
    status: '已发布',
    refCount: 1,
    usage: 'video',
    source: 'marketing',
    previewType: 'video-thumb',
    previewBg: '#1a221e',
    sizeBytes: '48.5 MB',
    dimensions: '3840 × 2160 · 60fps',
    sku: 'MKT-VIDEO-SMART-SYS',
    r2Key: 'media/video/alsvid-smart-system-demo.mp4',
  },
];

// 矢量自行车插画组件（完美对应设计稿视觉）
function BikeIllustration({ stroke = '#1c2420', accent = '#2ba265', isTransparent = false }) {
  return (
    <svg viewBox="0 0 320 220" className="asset-card__illustration" preserveAspectRatio="xMidYMid meet">
      {/* 后轮 */}
      <circle cx="75" cy="148" r="46" fill="none" stroke={stroke} strokeWidth="7" />
      <circle cx="75" cy="148" r="14" fill="none" stroke={stroke} strokeWidth="3" />
      {/* 前轮 */}
      <circle cx="245" cy="148" r="46" fill="none" stroke={stroke} strokeWidth="7" />
      <circle cx="245" cy="148" r="14" fill="none" stroke={stroke} strokeWidth="3" />
      
      {/* 牙盘与中轴 */}
      <circle cx="152" cy="148" r="15" fill={accent} fillOpacity="0.22" stroke={accent} strokeWidth="5" />
      <circle cx="152" cy="148" r="4" fill={stroke} />

      {/* 车架主梁 */}
      <path d="M75 148 L152 148 L125 76 L75 148" fill="none" stroke={stroke} strokeWidth="6" strokeLinejoin="round" />
      <path d="M152 148 L220 88 L125 76" fill="none" stroke={stroke} strokeWidth="6" strokeLinejoin="round" />

      {/* 前叉与立管 */}
      <path d="M245 148 L214 62" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M205 46 L226 46" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />

      {/* 车座管与座垫 */}
      <path d="M125 76 L118 52" fill="none" stroke={stroke} strokeWidth="6" />
      <path d="M102 50 C114 46, 134 46, 142 52" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" />

      {/* 链条 */}
      <line x1="75" y1="148" x2="152" y2="148" stroke={stroke} strokeWidth="2" strokeDasharray="3,3" />
    </svg>
  );
}

// 场景图插画组件（太阳、山丘、绿地与自行车）
function SceneryIllustration() {
  return (
    <svg viewBox="0 0 320 220" className="asset-card__scenery" preserveAspectRatio="xMidYMid meet">
      {/* 浅灰绿背景 */}
      <rect width="320" height="220" fill="#f4faf6" />
      {/* 太阳 */}
      <circle cx="210" cy="58" r="18" fill="#ffd147" />
      {/* 远山 */}
      <path d="M60 165 L170 85 L280 165 Z" fill="#9ec9ab" />
      {/* 前景山丘与草坪 */}
      <path d="M0 150 Q160 110 320 150 L320 220 L0 220 Z" fill="#58a06f" />
      {/* 骑行小剪影 */}
      <g transform="translate(110, 105) scale(0.38)">
        <circle cx="75" cy="148" r="40" fill="none" stroke="#ffffff" strokeWidth="9" />
        <circle cx="245" cy="148" r="40" fill="none" stroke="#ffffff" strokeWidth="9" />
        <path d="M75 148 L152 148 L125 76 L75 148" fill="none" stroke="#ffffff" strokeWidth="9" />
        <path d="M152 148 L220 88 L125 76" fill="none" stroke="#ffffff" strokeWidth="9" />
        <path d="M245 148 L214 62 L226 46" fill="none" stroke="#ffffff" strokeWidth="9" />
      </g>
    </svg>
  );
}

export default function AssetWorkspaceV2({ embedded = false }) {
  // 状态管理
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedUsage, setSelectedUsage] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [batchMode, setBatchMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState(new Set());
  const [activeDrawerAsset, setActiveDrawerAsset] = useState(null);
  const [drawerTab, setDrawerTab] = useState('基础信息');
  const [aiQueueOpen, setAiQueueOpen] = useState(false);

  // 快捷获取当前目录名称
  const currentFolderName = useMemo(() => {
    if (aiQueueOpen) return 'AI 待审核队列';
    const match = DIRECTORIES.find(d => d.id === selectedFolder);
    return match ? match.title : '全部资产';
  }, [selectedFolder, aiQueueOpen]);

  // 过滤资产列表
  const filteredAssets = useMemo(() => {
    return INITIAL_ASSETS.filter(item => {
      // 目录过滤
      if (!aiQueueOpen && selectedFolder !== 'all') {
        const dir = DIRECTORIES.find(d => d.id === selectedFolder);
        if (dir && item.folder !== dir.title) return false;
      }
      // 用途过滤
      if (selectedUsage !== 'all' && item.usage !== selectedUsage) {
        return false;
      }
      // 来源过滤
      if (selectedSource !== 'all' && item.source !== selectedSource) {
        return false;
      }
      // 市场过滤
      if (marketFilter !== 'all') {
        // demo 简单匹配
      }
      // 状态过滤
      if (statusFilter !== 'all') {
        if (statusFilter === 'published' && item.status !== '已发布') return false;
        if (statusFilter === 'private' && !item.isPrivate) return false;
      }
      // 搜索关键词
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(kw);
        const matchSku = item.sku.toLowerCase().includes(kw);
        const matchKey = item.r2Key.toLowerCase().includes(kw);
        if (!matchTitle && !matchSku && !matchKey) return false;
      }
      return true;
    });
  }, [selectedFolder, selectedUsage, selectedSource, marketFilter, statusFilter, searchKeyword, aiQueueOpen]);

  // 全选/多选逻辑
  const toggleSelectAsset = (id) => {
    const next = new Set(selectedAssetIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedAssetIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  return (
    <div className="aw2-root">
      {/* 顶部主导航栏 */}
      <header className="aw2-topbar">
        <div className="aw2-topbar__left">
          <button 
            type="button" 
            className="aw2-toggle-tree" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="展开/收起目录树"
          >
            <Icons.Tree />
            <span>目录树</span>
          </button>
          
          <h1 className="aw2-topbar__title">素材资产中心 V2.0</h1>
          
          <div className="aw2-topbar__badge">
            <span className="aw2-dot" />
            <span>并行独立版 · 原 V1 素材库保留中</span>
          </div>
        </div>

        <div className="aw2-topbar__right">
          <button 
            type="button" 
            className={`aw2-btn aw2-btn--outline ${batchMode ? 'is-active' : ''}`}
            onClick={() => {
              setBatchMode(!batchMode);
              if (batchMode) setSelectedAssetIds(new Set());
            }}
          >
            <Icons.Check />
            <span>{batchMode ? `已选 (${selectedAssetIds.size})` : '批量管理'}</span>
          </button>

          <button 
            type="button" 
            className="aw2-btn aw2-btn--primary"
            onClick={() => alert('已就绪：支持拖拽或直接选择 4K 高清主图、透明原图、矢量长图直传 Cloudflare R2。')}
          >
            <Icons.Cloud />
            <span>上传新素材</span>
          </button>
        </div>
      </header>

      {/* 主体工作区容器 */}
      <div className="aw2-layout">
        {/* 左侧边栏：车型与资产目录 */}
        {sidebarOpen && (
          <aside className="aw2-sidebar">
            {/* AI 待审核卡片 */}
            <div 
              className={`aw2-ai-banner ${aiQueueOpen ? 'is-active' : ''}`}
              onClick={() => {
                setAiQueueOpen(true);
                setSelectedFolder('all');
              }}
            >
              <div className="aw2-ai-banner__icon">✨</div>
              <div className="aw2-ai-banner__info">
                <div className="aw2-ai-banner__title">AI 待审核</div>
                <div className="aw2-ai-banner__subtitle">需质检并绑定SKU入库</div>
              </div>
              <div className="aw2-ai-banner__badge">3</div>
            </div>

            {/* 车型与资产目录标题 */}
            <div className="aw2-sidebar__group-head">
              <span className="aw2-sidebar__group-title">车型与资产目录</span>
              <button 
                type="button" 
                className="aw2-sidebar__sync-btn"
                onClick={() => alert('已从 ERP / PIM 车型主数据同步最新 SKU 关系。')}
              >
                主数据同步
              </button>
            </div>

            {/* 目录列表 */}
            <nav className="aw2-folder-list">
              {DIRECTORIES.map(dir => {
                const IconComponent = dir.icon;
                const isActive = !aiQueueOpen && selectedFolder === dir.id;
                return (
                  <button
                    key={dir.id}
                    type="button"
                    className={`aw2-folder-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      setAiQueueOpen(false);
                      setSelectedFolder(dir.id);
                    }}
                  >
                    <div className="aw2-folder-item__icon">
                      <IconComponent color={isActive ? '#2ba265' : '#6b7d74'} />
                    </div>
                    <div className="aw2-folder-item__content">
                      <div className="aw2-folder-item__title">{dir.title}</div>
                      <div className="aw2-folder-item__desc">{dir.desc}</div>
                    </div>
                    <span className="aw2-folder-item__count">{dir.count}</span>
                  </button>
                );
              })}
            </nav>

            {/* 底部存储池状态卡片 */}
            <div className="aw2-storage-card">
              <div className="aw2-storage-card__head">
                <div className="aw2-storage-card__title">
                  <Icons.Server />
                  <span>Cloudflare R2 存储池</span>
                </div>
                <span className="aw2-storage-card__status">已连通</span>
              </div>
              <div className="aw2-storage-card__grid">
                <div className="aw2-storage-card__col">
                  <div className="aw2-storage-card__label">公开商城桶</div>
                  <div className="aw2-storage-card__val">已发布直链</div>
                </div>
                <div className="aw2-storage-card__col">
                  <div className="aw2-storage-card__label">私有原图桶</div>
                  <div className="aw2-storage-card__val">15m 签名鉴权</div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* 右侧主视窗 */}
        <main className="aw2-main">
          {/* 用途 Tabs 切换栏 */}
          <div className="aw2-usage-bar">
            <div className="aw2-usage-tabs">
              {USAGES.map(u => {
                const isActive = selectedUsage === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`aw2-usage-tab ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedUsage(u.id)}
                  >
                    <span>{u.label}</span>
                    <span className="aw2-usage-tab__count">{u.count}</span>
                  </button>
                );
              })}
            </div>
            <div className="aw2-location-breadcrumb">
              当前位置: <strong>{currentFolderName}</strong>
            </div>
          </div>

          {/* 搜索与多维度筛选栏 */}
          <div className="aw2-filter-bar">
            {/* 搜索框 */}
            <div className="aw2-search-input">
              <Icons.Search />
              <input
                type="text"
                placeholder="搜文件名、R2 Key、主数据 SKU..."
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
              />
              {searchKeyword && (
                <button type="button" className="aw2-clear-btn" onClick={() => setSearchKeyword('')}>×</button>
              )}
            </div>

            {/* 来源分段选择器 */}
            <div className="aw2-source-segments">
              {SOURCES.map(s => {
                const isActive = selectedSource === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`aw2-segment-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedSource(s.id)}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* 市场筛选 */}
            <div className="aw2-select-wrapper">
              <select value={marketFilter} onChange={e => setMarketFilter(e.target.value)}>
                <option value="all">市场: 全部市场</option>
                <option value="DE">德国 (DE)</option>
                <option value="EU">欧盟通用 (EU)</option>
                <option value="CN">中国大陆 (CN)</option>
              </select>
            </div>

            {/* 状态筛选 */}
            <div className="aw2-select-wrapper">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">状态: 全部状态</option>
                <option value="published">已发布直链</option>
                <option value="private">私有加密鉴权</option>
              </select>
            </div>

            {/* 网格/列表切换 */}
            <div className="aw2-view-switcher">
              <button
                type="button"
                className={`aw2-view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="网格视图"
              >
                <Icons.Grid />
                <span>网格</span>
              </button>
              <button
                type="button"
                className={`aw2-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                onClick={() => setViewMode('list')}
                title="列表视图"
              >
                <Icons.List />
                <span>列表</span>
              </button>
            </div>
          </div>

          {/* 资产展示区域 */}
          {filteredAssets.length === 0 ? (
            <div className="aw2-empty-state">
              <div className="aw2-empty-icon">▤</div>
              <h3>暂无匹配的资产</h3>
              <p>请尝试重置筛选条件或清空搜索关键词</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* 网格视图 */
            <div className="aw2-grid">
              {filteredAssets.map(asset => {
                const isSelected = selectedAssetIds.has(asset.id);
                return (
                  <div
                    key={asset.id}
                    className={`aw2-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      if (batchMode) toggleSelectAsset(asset.id);
                      else setActiveDrawerAsset(asset);
                    }}
                  >
                    {/* 卡片顶部图片区域 */}
                    <div className={`aw2-card__preview ${asset.previewBg === 'checkerboard' ? 'is-checkerboard' : ''}`}>
                      {/* 格式与安全角标 */}
                      <div className="aw2-card__badges">
                        {asset.isPrivate && (
                          <span className="aw2-badge aw2-badge--private">
                            <Icons.Lock /> 私有R2
                          </span>
                        )}
                        <span className="aw2-badge aw2-badge--format">{asset.format}</span>
                      </div>

                      {/* 批量管理多选框 */}
                      {batchMode && (
                        <div 
                          className={`aw2-card__checkbox ${isSelected ? 'is-checked' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectAsset(asset.id);
                          }}
                        >
                          {isSelected && <Icons.Check />}
                        </div>
                      )}

                      {/* 卡片插画 / 缩略图渲染 */}
                      {asset.previewType === 'scenery' ? (
                        <SceneryIllustration />
                      ) : (
                        <BikeIllustration stroke="#1b241f" accent="#2ba265" isTransparent={asset.usage === 'transparent'} />
                      )}
                    </div>

                    {/* 卡片底部元数据 */}
                    <div className="aw2-card__meta">
                      <div className="aw2-card__row">
                        <span className="aw2-folder-tag">{asset.folder}</span>
                        <span className="aw2-version-tag">{asset.version}</span>
                      </div>

                      <div className="aw2-card__title" title={asset.title}>
                        {asset.title}
                      </div>

                      <div className="aw2-card__footer">
                        {asset.status === '已发布' ? (
                          <span className="aw2-status-pill aw2-status-pill--published">已发布</span>
                        ) : (
                          <span className="aw2-status-pill aw2-status-pill--private">🔒 私有</span>
                        )}
                        <span className="aw2-ref-count">引用 {asset.refCount} 处</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 列表视图 */
            <div className="aw2-list-view">
              <table className="aw2-table">
                <thead>
                  <tr>
                    {batchMode && (
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <th>预览</th>
                    <th>文件名 / 标题</th>
                    <th>所属车型</th>
                    <th>用途分类</th>
                    <th>格式</th>
                    <th>状态 / 权限</th>
                    <th>主数据 SKU</th>
                    <th>页面引用</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map(asset => {
                    const isSelected = selectedAssetIds.has(asset.id);
                    return (
                      <tr 
                        key={asset.id} 
                        className={isSelected ? 'is-selected' : ''}
                        onClick={() => {
                          if (batchMode) toggleSelectAsset(asset.id);
                          else setActiveDrawerAsset(asset);
                        }}
                      >
                        {batchMode && (
                          <td onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectAsset(asset.id)}
                            />
                          </td>
                        )}
                        <td style={{ width: 56 }}>
                          <div className={`aw2-table-thumb ${asset.previewBg === 'checkerboard' ? 'is-checkerboard' : ''}`}>
                            <BikeIllustration />
                          </div>
                        </td>
                        <td>
                          <div className="aw2-table-title">{asset.title}</div>
                          <div className="aw2-table-key">{asset.r2Key}</div>
                        </td>
                        <td><span className="aw2-folder-tag">{asset.folder}</span></td>
                        <td>{USAGES.find(u => u.id === asset.usage)?.label || asset.usage}</td>
                        <td><span className="aw2-badge aw2-badge--format">{asset.format}</span></td>
                        <td>
                          {asset.status === '已发布' ? (
                            <span className="aw2-status-pill aw2-status-pill--published">已发布</span>
                          ) : (
                            <span className="aw2-status-pill aw2-status-pill--private">🔒 私有</span>
                          )}
                        </td>
                        <td><code>{asset.sku}</code></td>
                        <td><strong>{asset.refCount} 处</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            type="button" 
                            className="aw2-row-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDrawerAsset(asset);
                            }}
                          >
                            详情 →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* 资产详细信息侧滑抽屉 (Drawer) */}
      {activeDrawerAsset && (
        <div className="aw2-drawer-overlay" onClick={() => setActiveDrawerAsset(null)}>
          <aside className="aw2-drawer" onClick={e => e.stopPropagation()}>
            <div className="aw2-drawer__head">
              <div>
                <span className="aw2-drawer__eyebrow">ASSET DETAILS · CLOUDFLARE R2</span>
                <h2>{activeDrawerAsset.title}</h2>
              </div>
              <button 
                type="button" 
                className="aw2-drawer__close"
                onClick={() => setActiveDrawerAsset(null)}
              >
                ×
              </button>
            </div>

            {/* 抽屉 Tabs */}
            <div className="aw2-drawer__tabs">
              {['基础信息', 'SKU 关联', '页面引用', '版本历史'].map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`aw2-drawer__tab ${drawerTab === tab ? 'is-active' : ''}`}
                  onClick={() => setDrawerTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* 抽屉内容区 */}
            <div className="aw2-drawer__body">
              {drawerTab === '基础信息' && (
                <div className="aw2-drawer__panel">
                  <div className={`aw2-drawer__preview ${activeDrawerAsset.previewBg === 'checkerboard' ? 'is-checkerboard' : ''}`}>
                    {activeDrawerAsset.previewType === 'scenery' ? (
                      <SceneryIllustration />
                    ) : (
                      <BikeIllustration />
                    )}
                  </div>

                  <dl className="aw2-drawer__dl">
                    <div>
                      <dt>素材名称</dt>
                      <dd>{activeDrawerAsset.title}</dd>
                    </div>
                    <div>
                      <dt>车型目录 / 格式</dt>
                      <dd>{activeDrawerAsset.folder} · {activeDrawerAsset.format}</dd>
                    </div>
                    <div>
                      <dt>文件尺寸 / 分辨率</dt>
                      <dd>{activeDrawerAsset.sizeBytes} · {activeDrawerAsset.dimensions}</dd>
                    </div>
                    <div>
                      <dt>对象存储 R2 Key</dt>
                      <dd><code>{activeDrawerAsset.r2Key}</code></dd>
                    </div>
                    <div>
                      <dt>发布状态与权限</dt>
                      <dd>{activeDrawerAsset.status} · {activeDrawerAsset.isPrivate ? '15分钟临时签名链接' : 'CDN 全球直链'}</dd>
                    </div>
                  </dl>

                  <div className="aw2-drawer__actions">
                    <button 
                      type="button" 
                      className="aw2-btn aw2-btn--primary"
                      onClick={() => alert(`已复制 R2 直链地址：https://cdn.alsvidbike.com/${activeDrawerAsset.r2Key}`)}
                    >
                      复制直链 CDN URL
                    </button>
                    {activeDrawerAsset.isPrivate && (
                      <button 
                        type="button" 
                        className="aw2-btn aw2-btn--outline"
                        onClick={() => alert('已生成带 15 分钟失效时间戳的防盗链安全签名 URL。')}
                      >
                        生成 15m 签名链接
                      </button>
                    )}
                  </div>
                </div>
              )}

              {drawerTab === 'SKU 关联' && (
                <div className="aw2-drawer__panel">
                  <h3>已绑定的产品主数据 SKU</h3>
                  <div className="aw2-sku-tag-box">
                    <span className="aw2-sku-pill">🏷️ {activeDrawerAsset.sku}</span>
                  </div>
                  <p className="aw2-tip-text">SKU 关联后，自建商城商品详情页及规格选择器将自动同步该素材。</p>
                </div>
              )}

              {drawerTab === '页面引用' && (
                <div className="aw2-drawer__panel">
                  <h3>自建商城与官网引用统计 ({activeDrawerAsset.refCount})</h3>
                  <ul className="aw2-ref-list">
                    <li>
                      <strong>商城首页 / A1 Ultra 旗舰全屏 KV 展示</strong>
                      <span>组件 key: <code>a1UltraShowcase</code></span>
                    </li>
                    <li>
                      <strong>商品详情页 / A1 Ultra 钛银规格主图</strong>
                      <span>URL: <code>/zh/e-bikes/carbon-e-bike-klapprad-a1-ultra</code></span>
                    </li>
                  </ul>
                  <p className="aw2-tip-text">⚠️ 该资产存在线上页面直接引用，系统已开启防误删保护。</p>
                </div>
              )}

              {drawerTab === '版本历史' && (
                <div className="aw2-drawer__panel">
                  <h3>素材版本历史</h3>
                  <div className="aw2-version-item is-active">
                    <div className="aw2-version-title">
                      <strong>v2.0 (当前生效)</strong>
                      <span className="aw2-version-badge">4K 超高清更新</span>
                    </div>
                    <p>已替换为 3840×2160 4K 完美去阴影透明原图，保持辐条边缘平滑。</p>
                  </div>
                  <div className="aw2-version-item">
                    <div className="aw2-version-title">
                      <strong>v1.0 (初始归档)</strong>
                      <span>2026-11-26 入库</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
