'use client';
import {useEffect,useState} from 'react';
import type {Locale} from '@/lib/alsvid-api';
const roles:Record<string,Record<Locale,string>>={
 legacy:{zh:'原有权限',en:'Legacy access',de:'Bisheriger Zugriff'},pending:{zh:'待授权',en:'Pending authorization',de:'Freigabe ausstehend'},company_admin:{zh:'企业管理员',en:'Company administrator',de:'Unternehmensadministrator'},procurement:{zh:'采购',en:'Procurement',de:'Einkauf'},finance:{zh:'财务',en:'Finance',de:'Finanzen'},store_manager:{zh:'店长',en:'Store manager',de:'Filialleitung'},store_staff:{zh:'店员',en:'Store staff',de:'Filialpersonal'},service:{zh:'售后',en:'After-sales',de:'Kundendienst'}
};
export const roleLabel=(role:string,locale:Locale)=>roles[role]?.[locale]||role;
const copy={zh:{account:'员工账号',role:'业务角色',status:'状态',enabled:'启用',disabled:'停用',reason:'调整权限的原因',error:'操作失败，请刷新。',hint:'仅管理已由 ALSVID 审核并关联本企业的员工。企业管理员、原有权限账号及新账号开通由 ALSVID 管理。变更后员工需重新登录。'},en:{account:'Employee account',role:'Business role',status:'Status',enabled:'Enabled',disabled:'Disabled',reason:'Reason for changing permissions',error:'Unable to proceed. Refresh and retry.',hint:'Manage approved employees already linked to this company. ALSVID manages administrator and legacy accounts and creates new accounts. Employees must sign in again after changes.'},de:{account:'Mitarbeiterkonto',role:'Geschäftsrolle',status:'Status',enabled:'Aktiv',disabled:'Deaktiviert',reason:'Grund für die Rechteänderung',error:'Vorgang fehlgeschlagen. Bitte aktualisieren.',hint:'Verwalten Sie geprüfte Mitarbeiter dieses Unternehmens. Administratoren, bisherige Konten und neue Konten verwaltet ALSVID. Nach Änderungen ist eine erneute Anmeldung nötig.'}};
type Staff={id:string;username:string;enabled:boolean;businessRole:string;roleRevision:number};
const prefix='/api/portal/dealer/center/staff';
export function DealerStaff({locale,membershipId}:{locale:Locale;membershipId:string}){
 const t=copy[locale],[rows,setRows]=useState<Staff[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){const r=await fetch(prefix,{cache:'no-store'});if(!r.ok)throw Error('load');setRows(await r.json())}
 useEffect(()=>{void load().catch(()=>{setRows([]);setError(t.error)})},[]);
 async function change(row:Staff,businessRole:string){const reason=window.prompt(t.reason);if(!reason?.trim())return;setBusy(true);setError('');try{const r=await fetch(prefix+'/'+row.id+'/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({membershipId,businessRole,revision:row.roleRevision,reason}),cache:'no-store'});if(!r.ok)throw Error('role');await load()}catch{setError(t.error);setRows([])}finally{setBusy(false)}}
 return <div><p>{t.hint}</p>{error&&<p role="alert">{error}</p>}<div className="dealer-scroll"><table><thead><tr><th>{t.account}</th><th>{t.role}</th><th>{t.status}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.username}</td><td>{row.id===membershipId||['legacy','company_admin'].includes(row.businessRole)?roleLabel(row.businessRole,locale):<select disabled={busy} value={row.businessRole} onChange={e=>void change(row,e.target.value)}>{Object.keys(roles).filter(r=>!['legacy','company_admin'].includes(r)).map(r=><option key={r} value={r}>{roleLabel(r,locale)}</option>)}</select>}</td><td>{row.enabled?t.enabled:t.disabled}</td></tr>)}</tbody></table></div></div>
}
