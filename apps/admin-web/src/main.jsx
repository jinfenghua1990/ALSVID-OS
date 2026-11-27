import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { parseCatalogRoute } from './catalog-route.js';
import { parsePortalRoute } from './portal-route.js';
import { parseWebsiteProductRoute, parseUnmigratedWebsiteRoute, parsePublicLocationsRoute, parseDealerPartnershipRoute } from './website-route.js';
import './styles.css';
import './admin-dark-neutral.css';

const HomeRoute = lazy(() => import('./pages/HomeRoute.jsx'));
const CatalogPage = lazy(() => import('./pages/CatalogPage.jsx'));
const PortalPage = lazy(() => import('./pages/PortalPage.jsx'));
const SupplierPortalPage = lazy(() => import('./pages/SupplierPortalPage.jsx'));
const CmsPublicPage = lazy(() => import('./pages/CmsPublicPage.jsx'));
const DealerApplicationForm = lazy(() => import('./pages/DealerApplicationForm.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const ProductReferencePage = lazy(() => import('./pages/ProductReferencePage.jsx'));
const PublicLocationsPage = lazy(() => import('./pages/PublicLocationsPage.jsx'));
const DealerPartnershipPage = lazy(() => import('./pages/DealerPartnershipPage.jsx'));

const hostname = window.location.hostname.toLowerCase();
const portalRoute = parsePortalRoute(window.location.pathname, hostname);
const portalKind = portalRoute?.kind || null;
const homeMatch = window.location.pathname.match(/^\/www\/(zh|en|de)\/?$/);
const homeLocale = homeMatch?.[1] || ((window.location.pathname === '/www' || window.location.pathname === '/www/') ? 'zh' : null);
async function authFetch(path, options) { try { return await fetch(path, options); } catch (_) { throw Error('无法连接账号服务，请检查网络后重试'); } }
async function authJson(response) { try { return await response.json(); } catch (_) { throw Error('账号服务返回异常，请稍后重试'); } }
function AuthGate(){
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const returnToValue=new URLSearchParams(window.location.search).get('returnTo');
  const ownerReturnTo=portalKind==='owner'&&/^\/www\/(?:zh|en|de)\/products\?cart=1$/.test(returnToValue||'')?returnToValue:null;
  useEffect(()=>{let robots=document.head.querySelector('meta[name="robots"]');if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots)}robots.content='noindex,nofollow';document.title=portalKind==='owner'?'ALSVID 车主中心':portalKind==='dealer'?'ALSVID 经销商中心':portalKind==='supplier'?'ALSVID 供应商门户':'ALSVID 管理系统'},[]);
  useEffect(()=>{if(status?.user?.role==='owner'&&ownerReturnTo)window.location.replace(ownerReturnTo)},[status?.user?.role,ownerReturnTo]);
  const refresh=async()=>{const r=await authFetch('/api/auth/status');if(!r.ok)throw Error('无法连接账号服务，请稍后重试');setStatus(await authJson(r))};
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
  const submit=async (e,loginUsername,loginPassword,onAuthenticated)=>{e.preventDefault();setBusy(true);setError('');try{if(!status.initialized){const r=await authFetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:loginUsername,password:loginPassword})});const data=await authJson(r);if(!r.ok)throw Error(data.error||'设置失败')}const r=await authFetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:loginUsername,password:loginPassword})});const data=await authJson(r);if(!r.ok)throw Error(data.error||'登录失败');await onAuthenticated?.();if(data.user?.role==='owner'&&ownerReturnTo){window.location.replace(ownerReturnTo);return}await refresh()}catch(e){setError(e.message);await refresh().catch(()=>{})}finally{setBusy(false)}};
  const logout=async()=>{try{const r=await authFetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw Error('退出登录失败，请重试');await refresh()}catch(e){window.alert(e.message||'退出登录失败，请重试')}};
  if(status?.user&&portalKind&&status.user.role!==portalKind)return <main style={{maxWidth:600,margin:'10vh auto',padding:24}}><h2>当前账号不属于此门户</h2><p>请使用对应的{portalKind==='supplier'?'供应商':portalKind==='owner'?'车主':'经销商'}账号登录。</p><a href="/">返回我的工作区</a> <button className="btn" onClick={logout}>退出并切换账号</button></main>;
  if(status?.user&&portalRoute&&!portalRoute.supported)return <main style={{maxWidth:600,margin:'10vh auto',padding:24}}><h2>该页面尚未迁移</h2><p>此功能暂不可从此入口访问。</p><a href={portalKind==='owner'?'/my':'/dealer'}>返回门户首页</a> <button type="button" onClick={logout}>退出登录</button></main>;
  if(status?.user && /^\/admin\/mall\/assets-v2\/?$/.test(window.location.pathname)) return status.user.role === 'admin' ? <App user={status.user} onLogout={logout} /> : <main style={{padding:24}}>仅管理员可访问素材资产中心。 <a href="/">返回工作区</a></main>;
  if(status?.user)return <>{['owner','dealer'].includes(status.user.role)?<><PortalPage user={status.user} onLogout={logout} targetSection={portalRoute?.section}/><button onClick={logout} style={{position:'fixed',right:12,bottom:12,zIndex:1000}} className="btn">退出登录 · {status.user.username}</button></>:status.user.role==='supplier'?<SupplierPortalPage user={status.user} onLogout={logout}/>:<App user={status.user} onLogout={logout}/>}</>;
  if(!status)return <div className="hint" style={{padding:24}} />;
  if(portalKind&&!status.initialized)return <main style={{padding:24}}>门户尚未开通，请联系管理员。</main>;
  return <LoginPage status={status} error={error} busy={busy} onSubmit={submit} portalKind={portalKind}>{portalKind==='dealer'&&status.initialized&&<DealerApplicationForm/>}</LoginPage>;
}
const catalogRoute = parseCatalogRoute(window.location.pathname);
const websiteProductRoute = parseWebsiteProductRoute(window.location.pathname);
const publicLocationsRoute = parsePublicLocationsRoute(window.location.pathname);
const dealerPartnershipRoute = parseDealerPartnershipRoute(window.location.pathname);
const unmigratedWebsiteRoute = parseUnmigratedWebsiteRoute(window.location.pathname);
const cmsRoute = window.location.pathname.match(/^\/www\/(zh|en|de)\/([a-z0-9][a-z0-9/-]*?)\/?$/);
const unavailableCopy = { zh: ['页面尚未迁移', '此页面暂不可用。', '返回官网'], en: ['Page not yet migrated', 'This page is temporarily unavailable.', 'Back to website'], de: ['Seite noch nicht migriert', 'Diese Seite ist vorübergehend nicht verfügbar.', 'Zur Website'] };
function UnmigratedWebsitePage({lang}) { const [title, message, back] = unavailableCopy[lang]; useEffect(()=>{document.title=`${title} · ALSVID`; let robots=document.querySelector('meta[name="robots"]'); if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots)} robots.content='noindex,nofollow'},[title]); return <main lang={lang} style={{maxWidth:600,margin:'10vh auto',padding:24}}><h1>{title}</h1><p>{message}</p><a href={`/www/${lang}`}>{back}</a></main>; }
createRoot(document.getElementById('root')).render(<Suspense fallback={<div className="hint" role="status" style={{ padding: 24 }}>正在载入页面…</div>}>{catalogRoute ? <CatalogPage lang={catalogRoute.lang} productId={catalogRoute.productId} /> : websiteProductRoute ? <ProductReferencePage lang={websiteProductRoute.lang} product={websiteProductRoute.product} /> : publicLocationsRoute ? <PublicLocationsPage {...publicLocationsRoute} /> : dealerPartnershipRoute ? <DealerPartnershipPage {...dealerPartnershipRoute} /> : unmigratedWebsiteRoute ? <UnmigratedWebsitePage lang={unmigratedWebsiteRoute.lang} /> : homeLocale ? <HomeRoute locale={homeLocale} myUrl="/my" dealerUrl="/dealer" /> : portalRoute ? <AuthGate /> : cmsRoute ? <CmsPublicPage lang={cmsRoute[1]} path={`/${cmsRoute[2]}`} /> : <AuthGate />}</Suspense>);
