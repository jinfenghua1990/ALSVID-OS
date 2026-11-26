import type {Metadata} from 'next';
import Home from '../[locale]/page';
import {SiteShellFrame} from '@/components/site-shell-frame';
import {ShellReviewConfirm} from '@/components/shell-review-confirm';
import {apiOrigin} from '@/lib/origins';
import type {Locale,SiteAnnouncementConfig,SiteHeaderConfig,SiteFooterConfig} from '@/lib/alsvid-api';
import '../globals.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'装修审核预览',robots:{index:false,follow:false,nocache:true},referrer:'no-referrer'};
type Review={locale:Locale;device:string;kind:'announcement'|'header'|'footer';config:SiteAnnouncementConfig|SiteHeaderConfig|SiteFooterConfig|null;draft:boolean;session:string;receipt:string};
export default async function DesignPreview({searchParams}:{searchParams:Promise<{token?:string;parent?:string}>}){
 const query=await searchParams;
 let result:Review|null=null,parentOrigin='';
 try{
   if(typeof query.token!=='string'||query.token.length>4096||typeof query.parent!=='string')throw Error('invalid');
   const parent=new URL(query.parent);
   if(!['http:','https:'].includes(parent.protocol)||parent.origin!==query.parent)throw Error('invalid');
   parentOrigin=parent.origin;
   const origin=apiOrigin();if(!origin)throw Error('unconfigured');
   const response=await fetch(origin+'/api/cms/shell-review-preview?token='+encodeURIComponent(query.token),{cache:'no-store'});
   if(!response.ok)throw Error('invalid');
   result=await response.json() as Review;
   if(!['zh','en','de'].includes(result.locale)||!['desktop','mobile'].includes(result.device)||!['announcement','header','footer'].includes(result.kind)||typeof result.receipt!=='string')throw Error('invalid');
 }catch{return <main style={{padding:32}} role="alert">草稿预览不可用或已失效，请回后台重新生成。</main>}
 if(!result)return null;
 return <div lang={result.locale} style={{paddingBottom:80}}>
   <SiteShellFrame lang={result.locale} override={{kind:result.kind,config:result.config}}><Home params={Promise.resolve({locale:result.locale})}/></SiteShellFrame>
   <ShellReviewConfirm receipt={result.receipt} session={result.session} locale={result.locale} device={result.device} draft={result.draft} parentOrigin={parentOrigin}/>
 </div>
}
