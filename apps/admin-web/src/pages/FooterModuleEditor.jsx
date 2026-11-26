import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ShellReleaseReview from './ShellReleaseReview.jsx';

// G04 全站公共页脚 —— 独立编辑器。
//
// 为什么单独一个文件：页脚存的是结构化配置（分组 + 链接），不是画布，
// 放进通用装修编辑器里容易被别的模块改动波及。这里只认 /site-shell/footer 这一条记录，
// 不碰 G01 公告栏 / G02 顶部导航 / G03 页面主体，也不改公共的 UnifiedDesignEditor。
const PATH = '/site-shell/footer';
const LOCALES = [['zh', '中文'], ['en', 'English'], ['de', 'Deutsch']];
const NAMES = { zh: '全站公共页脚', en: 'Global Footer', de: 'Global Footer' };

const FOOTER_PRESETS = {
  zh: {
    brand: "ALSVID · 电助力轻量出行",
    groups: [
      {
        title: "关于品牌",
        links: [
          { label: "企业信息", href: "/zh/about" },
          { label: "联系我们", href: "/zh/dealers" },
          { label: "社交媒体", href: "https://instagram.com/alsvid_official" }
        ]
      },
      {
        title: "客户服务",
        links: [
          { label: "配送政策", href: "/zh/legal/versand" },
          { label: "退换货政策", href: "/zh/legal/widerrufsbelehrung" },
          { label: "支付方式", href: "/zh/legal/zahlung" }
        ]
      },
      {
        title: "政策与合规",
        links: [
          { label: "隐私政策", href: "/zh/legal/datenschutz" },
          { label: "销售条款", href: "/zh/legal/agb" },
          { label: "德国企业法定信息", href: "/zh/legal/impressum" }
        ]
      },
      {
        title: "动态资讯",
        links: [
          { label: "邮件订阅", href: "/zh/newsletter" }
        ]
      }
    ]
  },
  en: {
    brand: "ALSVID · Electric Mobility for Everyone",
    groups: [
      {
        title: "About Us",
        links: [
          { label: "Company Information", href: "/en/about" },
          { label: "Contact Us", href: "/en/dealers" },
          { label: "Social Media", href: "https://instagram.com/alsvid_official" }
        ]
      },
      {
        title: "Customer Support",
        links: [
          { label: "Shipping Policy", href: "/en/legal/versand" },
          { label: "Return & Refund Policy", href: "/en/legal/widerrufsbelehrung" },
          { label: "Payment Methods", href: "/en/legal/zahlung" }
        ]
      },
      {
        title: "Legal & Policies",
        links: [
          { label: "Privacy Policy", href: "/en/legal/datenschutz" },
          { label: "Terms & Conditions", href: "/en/legal/agb" },
          { label: "Impressum", href: "/en/legal/impressum" }
        ]
      },
      {
        title: "Stay Connected",
        links: [
          { label: "Newsletter", href: "/en/newsletter" }
        ]
      }
    ]
  },
  de: {
    brand: "ALSVID · Intelligente E-Mobilität",
    groups: [
      {
        title: "Über uns",
        links: [
          { label: "Unternehmensinformationen", href: "/de/about" },
          { label: "Kontakt", href: "/de/dealers" },
          { label: "Social Media", href: "https://instagram.com/alsvid_official" }
        ]
      },
      {
        title: "Kundenservice",
        links: [
          { label: "Versandinformationen", href: "/de/legal/versand" },
          { label: "Widerrufs- & Rückgaberecht", href: "/de/legal/widerrufsbelehrung" },
          { label: "Zahlungsarten", href: "/de/legal/zahlung" }
        ]
      },
      {
        title: "Rechtliches",
        links: [
          { label: "Datenschutzerklärung", href: "/de/legal/datenschutz" },
          { label: "AGB", href: "/de/legal/agb" },
          { label: "Impressum", href: "/de/legal/impressum" }
        ]
      },
      {
        title: "Newsletter",
        links: [
          { label: "Newsletter abonnieren", href: "/de/newsletter" }
        ]
      }
    ]
  }
};

const EMPTY = { kind: 'footer', brand: '', groups: [] };

export default function FooterModuleEditor({ locale: initialLocale = 'zh', onClose }) {
  const [locale, setLocale] = useState(initialLocale);
  const [page, setPage] = useState(null);
  const [value, setValue] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState(false);

  
  const applyPreset = () => {
    const preset = FOOTER_PRESETS[locale] || FOOTER_PRESETS.zh;
    setValue({ kind: "footer", brand: preset.brand, groups: JSON.parse(JSON.stringify(preset.groups)) });
    setNotice("已一键填入 " + (locale === "zh" ? "中文" : locale === "en" ? "英文" : "德文") + " 规范页脚内容，包含企业信息、联系我们、政策条款与订阅！");
  };

  const dirty = value !== null && JSON.stringify(value) !== baseline;

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setNotice(''); setReview(false);
    (async () => {
      try {
        const rows = await api.cmsPages({ type: 'shared_module', locale, path: PATH });
        const row = (rows || []).find(r => r.path === PATH && r.locale === locale);
        const doc = row ? await api.cmsPage(row.id) : null;
        if (!alive) return;
        const shell = doc?.draft?.siteShell || doc?.published?.siteShell || EMPTY;
        setPage(doc);
        setValue({ ...EMPTY, ...shell, groups: Array.isArray(shell.groups) ? shell.groups : [] });
        setBaseline(JSON.stringify({ ...EMPTY, ...shell, groups: Array.isArray(shell.groups) ? shell.groups : [] }));
      } catch (e) {
        if (alive) { setError(e.message || '读取页脚配置失败'); setPage(null); setValue(null); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [locale]);

  const patch = next => { setValue(current => ({ ...current, ...next })); setReview(false); };
  const patchGroup = (i, next) => patch({ groups: value.groups.map((g, j) => (j === i ? { ...g, ...next } : g)) });

  const save = async () => {
    if (!value || busy || loading) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const draft = { ...(page?.draft || page?.published || { blocks: [] }), siteShell: { ...value, kind: 'footer' } };
      const updated = page
        ? await api.saveCmsDraft(page.id, { revision: page.revision, draft, seo: page.draftSeo || page.publishedSeo || {} })
        : await api.createCmsPage({ pageType: 'shared_module', locale, path: PATH, name: NAMES[locale] || '全站公共页脚', draft, seo: {} });
      const shell = updated.draft?.siteShell || value;
      setPage(updated);
      setValue({ ...EMPTY, ...shell, groups: shell.groups || [] });
      setBaseline(JSON.stringify({ ...EMPTY, ...shell, groups: shell.groups || [] }));
      setNotice('草稿已保存，正式版本未改变。');
    } catch (e) {
      setError(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const total = (value?.groups || []).reduce((sum, group) => sum + (group.links || []).length, 0);

  return (
    <div className="footer-editor" role="dialog" aria-label="全站公共页脚编辑">
      <div className="footer-editor__dialog">
        <header className="footer-editor__head">
          <div>
            <h2>G04 · 全站公共页脚</h2>
            <small>{PATH} · {page?.publishedVersion ? `正式 v${page.publishedVersion}` : '尚未发布'} · {value ? `${value.groups.length} 组 / ${total} 条` : ''}</small>
          </div>
          <div className="footer-editor__actions">
            {LOCALES.map(([code, label]) => (
              <button key={code} type="button" className={'btn small' + (locale === code ? ' primary' : '')} onClick={() => setLocale(code)}>
                {label}
              </button>
            ))}
            <button type="button" className="btn" disabled={!value || busy || loading || !dirty} onClick={save}>
              {busy ? '保存中…' : '保存草稿'}
            </button>
            <button type="button" className="btn primary" disabled={!page || busy || loading || dirty} onClick={() => setReview(true)}>
              发布前检查
            </button>
            <button type="button" className="btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        <div className="footer-editor__body">
          {error && <p className="error-text" role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {loading ? (
            <p className="hint">正在读取页脚配置…</p>
          ) : !value ? (
            <p className="hint">该语言还没有页脚配置，点「保存草稿」会新建一条。</p>
          ) : (
            <>
              {(!value.groups || value.groups.length === 0) && (
                <div style={{ background: "#edf5f0", border: "1px solid #c4dece", padding: "12px 16px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <strong style={{ color: "#1b4d2e", fontSize: 13 }}>当前页脚尚未配置内容</strong>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#3a6148" }}>可一键套用标准德系电商页脚（企业信息、联系我们、配送退换、支付与合规条款）。</p>
                  </div>
                  <button type="button" className="btn small primary" onClick={applyPreset}>一键填入推荐预设</button>
                </div>
              )}

              <section className="footer-editor__card">
                <label className="footer-editor__field">
                  <span>品牌版权说明文字（留空沿用系统默认）</span>
                  <input maxLength={120} placeholder="© 2026 ALSVID Electric Mobility GmbH. Alle Rechte vorbehalten." value={value.brand || ''} onChange={e => patch({ brand: e.target.value })}/>
                </label>
              </section>

              {value.groups.map((group, i) => (
                <section className="footer-editor__group" key={i}>
                  <div className="footer-editor__group-head">
                    <label className="footer-editor__field footer-editor__field--inline">
                      <span>分组名称：</span>
                      <input maxLength={80} placeholder="例如：关于品牌 / 客户服务" value={group.title || ''} onChange={e => patchGroup(i, { title: e.target.value })}/>
                    </label>
                    <button type="button" className="btn small danger-text" onClick={() => patch({ groups: value.groups.filter((_, j) => j !== i) })}>
                      删除分组
                    </button>
                  </div>

                  <div className="footer-editor__links-list">
                    {(group.links || []).map((link, j) => (
                      <div className="footer-editor__link" key={j}>
                        <input className="footer-editor__input--name" aria-label="链接名称" maxLength={80} placeholder="链接名称（如：联系我们）" value={link.label || ''} onChange={e => patchGroup(i, { links: group.links.map((row, k) => (k === j ? { ...row, label: e.target.value } : row)) })}/>
                        <input className="footer-editor__input--href" aria-label="链接地址" maxLength={500} placeholder="链接路径（如：/zh/about 或 https://…）" value={link.href || ''} onChange={e => patchGroup(i, { links: group.links.map((row, k) => (k === j ? { ...row, href: e.target.value } : row)) })}/>
                        <button type="button" className="btn small" onClick={() => patchGroup(i, { links: group.links.filter((_, k) => k !== j) })}>
                          移除
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="footer-editor__group-foot">
                    <button type="button" className="btn small" disabled={(group.links || []).length >= 12} onClick={() => patchGroup(i, { links: [...(group.links || []), { label: '', href: '' }] })}>
                      + 添加链接
                    </button>
                    <span className="hint" style={{ fontSize: 11, margin: 0 }}>已配置 {(group.links || []).length} 条链接</span>
                  </div>
                </section>
              ))}

              <div style={{ paddingTop: 4 }}>
                <button type="button" className="btn small" disabled={value.groups.length >= 6} onClick={() => patch({ groups: [...value.groups, { title: '', links: [] }] })}>
                  + 新增导航分组
                </button>
              </div>

              {review && page && (
                <ShellReleaseReview
                  key={page.id + ':' + page.revision}
                  page={page}
                  onClose={() => setReview(false)}
                  onPublished={updated => {
                    const shell = updated.draft?.siteShell || updated.published?.siteShell || value;
                    setPage(updated);
                    setValue({ ...EMPTY, ...shell, groups: shell.groups || [] });
                    setBaseline(JSON.stringify({ ...EMPTY, ...shell, groups: shell.groups || [] }));
                    setReview(false);
                    setNotice(updated.storefrontRevalidate?.ok ? '发布成功，前台缓存已刷新。' : '发布成功；前台缓存刷新尚未确认，请自行打开站点确认。');
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
