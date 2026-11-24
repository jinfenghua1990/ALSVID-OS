import React, { useEffect, useState } from 'react';
import { HomePage as OriginalHomePage } from '../original-home/_components/home/home-page.tsx';

// /api/site/layout 在「该语言未发布装修方案」时返回 404，这是后端的既定契约：
// 让前台回退系统默认模板，而不是拿中文版式顶替。这里按三级回落渲染：
//   1) 已发布的可视化装修方案（html + css）
//   2) 官网首页文案配置（眉题 / 主标题 / 介绍 / 按钮）套进内置设计
//   3) 内置硬编码设计（原始迁移版式）
async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw Error('request failed');
  return res.json();
}

// 装修 CSS 的既有矛盾：全局 `.alsvid-storefront a{color:inherit}`（特异性 0,1,1）
// 会盖掉组件类自己的配色，例如 `.button{color:#fff}`（0,1,0），结果是深底按钮上
// 出现同色文字、看起来「没有文字」。这里把装修 CSS 中所有「单类选择器且声明了 color」
// 的规则，以 `a.类名` 的形式在布局作用域内重发一次（0,2,1），颜色值仍取自设计本身。
function anchorColorCompat(css) {
  const out = [];
  // 按 "}" 切块，每块从选择器起始处开始，避免正则吃掉了上一条规则的收尾括号。
  for (const block of css.split('}')) {
    const head = /^\s*\.([A-Za-z0-9_-]+)\s*\{([\s\S]*)$/.exec(block);
    if (!head) continue;
    const color = /(?:^|;)\s*color\s*:\s*([^;}]+)/.exec(head[2]);
    if (!color) continue;
    out.push(`.home-route-layout a.${head[1]}{color:${color[1].trim()}}`);
  }
  return out.join('');
}

export default function HomeRoute({ locale, myUrl = '/my', dealerUrl = '/dealer' }) {
  const [state, setState] = useState({ phase: 'loading', html: '', css: '', content: null });
  // 后台「预览草稿」用 ?draft=1 打开：只对管理员有效，返回未发布的装修草稿
  const draftPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('draft') === '1';

  useEffect(() => {
    let active = true;
    setState({ phase: 'loading', html: '', css: '', content: null });
    (async () => {
      let layout = null;
      try {
        layout = await getJson(`/api/site/layout?locale=${encodeURIComponent(locale)}${draftPreview ? '&draft=1' : ''}`);
      } catch {
        layout = null;
      }
      if (!active) return;
      if (layout && typeof layout.html === 'string' && layout.html.trim()) {
        setState({ phase: 'layout', html: layout.html, css: typeof layout.css === 'string' ? layout.css : '', content: null });
        return;
      }
      let content = null;
      try {
        content = await getJson(`/api/catalog/homepage?lang=${encodeURIComponent(locale)}`);
      } catch {
        content = null;
      }
      if (!active) return;
      setState({ phase: 'design', html: '', css: '', content: content || null });
    })();
    return () => { active = false; };
  }, [locale, draftPreview]);

  if (state.phase === 'loading') return <div className="home-route-loading" role="status" aria-live="polite" />;

  if (state.phase === 'layout') {
    return <>
      {state.css ? <style dangerouslySetInnerHTML={{ __html: state.css + anchorColorCompat(state.css) }} /> : null}
      <div className="home-route-layout" dangerouslySetInnerHTML={{ __html: state.html }} />
    </>;
  }

  return <OriginalHomePage locale={locale} myUrl={myUrl} dealerUrl={dealerUrl} content={state.content} />;
}
