import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {uuidv7} from '../uuidv7.js';
import {api,adminFetch} from '../api.js';
import {needsDraftIdentityRecovery,recoverDraftIdentity} from '../draft-identity.js';
import {buildVehicleSku} from '../sku.js';
import { FieldLibDialog, ColorDictDialog } from '../Dialogs.jsx';
import { ImagesTab } from './EditorPage.jsx';

const VEHICLE_TYPE='EBI';
const MODEL_RE=/^[A-Z0-9]{2,3}$/;
// 四段式：[车型代际]-[配置版本]-[外观颜色]-[市场法规]；以下为内置默认，后台字段标准库可覆盖。
const DEFAULT_TRIMS=['ULT','PRO','STD'];
const DEFAULT_REGIONS=['EUR','GBR','USA'];
const TRIM_DESC={ULT:'Ultra 旗舰配置',PRO:'Pro 性能配置',STD:'Standard 标准配置'};
const REGION_DESC={EUR:'欧盟 EPAC 法规',GBR:'英国法规',USA:'美国法规'};
// 欧盟 EPAC 法定标准：系统锁定，不允许在界面上篡改。
const COMPLIANCE_STANDARD='EN 15194:2017+A1:2023';
// 整车硬件技术参数按系统模块归类，避免几十个输入框平铺。
const HW_GROUPS=[
  {key:'battery',icon:'🔋',title:'动力电池系统',sub:'Battery System',codes:['battery_form','electrical_voltage','battery_capacity','battery_capacity_ah','battery_cell_brand','battery_ip_rating','range','battery_charge_time','extended_battery','battery_certs']},
  {key:'frame',icon:'🚲',title:'车身车架与几何',sub:'Frame & Geometry',codes:['frame_material','standover_height','folding_structure','folded_size','weight_chain','weight_belt','rider_height','max_rider_load','surface_finish']},
  {key:'motor',icon:'⚡',title:'电机动力与电控',sub:'Drive & Motor · EN 15194',codes:['drive_type','rated_power_w','max_torque','max_assist_speed_kmh','pedal_sensor','throttle_mode','display_spec']},
  {key:'drivetrain',icon:'⚙️',title:'传动与机械变速',sub:'Drivetrain',codes:['transmission','transmission_set']},
  {key:'brake',icon:'🛑',title:'制动、避震与轮组',sub:'Brakes, Suspension & Wheels',codes:['brakes','brake_model','rotor_front','rotor_rear','front_suspension','rear_suspension','tire_spec','tire_brand','tire_model','tire_type','wheel_size']},
];
const COMPLIANCE_CODES=['compliance_standard','certification','street_legal_eu'];
// 与服务端 sku-code.js 的 vehicleFamily 一致：A1S/A1U/A1P 的代际归一为 A1（最后一位是旧版本梯队）。
const vehicleFamilyOf=value=>{const v=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{2,3}$/.test(v))return '';return v.length===3&&/[SUP]$/.test(v[2])&&/^[A-Z][0-9]$/.test(v.slice(0,2))?v.slice(0,2):v};

const blank=()=>({id:uuidv7(),kind:'vehicle',name:'',model:'',platform:'',productType:VEHICLE_TYPE,ownership:'',status:'启用',uses:[],specs:{},skus:[],skuSpecSelection:[],skuColorSelection:[],skuRegionSelection:'EUR',fitments:[],bom:{version:'V1.0',items:[]},images:[]});
const seoProductIdOf=draft=>String(draft?.specs?._seoProductId||'').trim().toLowerCase();
const seoSuggestionOf=draft=>{
  const model=String(draft?.model||'').trim().toUpperCase();
  const selection=draft?.skuSpecSelection||[];
  if(selection.length!==1)return '';
  const suggestions={'A1-STD':'carbon-e-bike-klapprad-a1','A1-ULT':'carbon-e-bike-klapprad-a1-ultra','L1-STD':'carbon-e-bike-klapprad-l1','L1-PRO':'carbon-e-bike-klapprad-mittelmotor-l1-pro'};
  return suggestions[`${model}-${selection[0]}`]||'';
};

// Code 128 B 条码：仅用于外箱标签预览，按标准字符集编码。
const C128=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
function barcodeBars(value){
  const text=String(value||'');
  if(!text||[...text].some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)>126))return{modules:[],total:0};
  const values=[104,...[...text].map(ch=>ch.charCodeAt(0)-32)];
  const checksum=values.reduce((sum,v,i)=>sum+(i? v*i:104),0)%103;
  const modules=[];
  for(const v of [...values.slice(1),checksum,106]){
    const pattern=C128[v];
    if(!pattern)return{modules:[],total:0};
    pattern.split('').forEach((width,i)=>modules.push({width:Number(width),bar:i%2===0}));
  }
  return{modules,total:modules.reduce((n,m)=>n+m.width,0)};
}
function BarcodeLabel({value}){
  const {modules,total}=useMemo(()=>barcodeBars(value),[value]);
  if(!total)return <div className="barcode-empty">输入有效 SKU 后显示条码</div>;
  let x=0;
  return <svg className="barcode" viewBox={`0 0 ${total} 48`} preserveAspectRatio="none" role="img" aria-label={`条码 ${value}`}>
    {modules.map((m,i)=>{const rect=m.bar?<rect key={i} x={x} y="0" width={m.width} height="48" fill="#111"/>:null;x+=m.width;return rect;})}
  </svg>;
}

export default function CreateVehicleWizard({meta,onBack,onCreated,workspaceKey,onWorkspaceDirtyChange,productId,onNotify}){
  const editing=Boolean(productId);
  const [draft,setDraft]=useState(null);
  const [baseline,setBaseline]=useState(null);
  const [draftVersion,setDraftVersion]=useState(0);
  const [fields,setFields]=useState([]);
  const [colors,setColors]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [invalid,setInvalid]=useState({});
  const [replacePrompt,setReplacePrompt]=useState(null);
  // 新建时若配置版本已归属其他主档，弹出二选一：追加到该主档 / 单独新建。
  const [trimPrompt,setTrimPrompt]=useState(null);
  const trimChoice=useRef(null);
  // 追加目标主档 id：同代际可能存在多条同名主档，必须显式指定追加到哪一条。
  const appendTarget=useRef(null);
  // 服务端当前真实的 SKU 组合（spec|color），用于判断保存后是否真的发生变化。
  const [serverSkuKeys,setServerSkuKeys]=useState([]);
  const forceReplace=useRef(false);
  const clearInvalid=key=>setInvalid(prev=>{if(!prev[key])return prev;const next={...prev};delete next[key];return next});
  const [newColor,setNewColor]=useState(null);
  const [showFields,setShowFields]=useState(false);
  const [showColors,setShowColors]=useState(false);
  const [tab,setTab]=useState('basic');
  const [sourceProduct,setSourceProduct]=useState(null);
  // 产品级第三方链接：标签栏快捷入口 + 居中弹窗配置，数据来自 /api/products/:id/external-links。
  const [externalLinks,setExternalLinks]=useState([]);
  const [linksOpen,setLinksOpen]=useState(false);
  const [linksDraft,setLinksDraft]=useState([]);
  const [linksBusy,setLinksBusy]=useState(false);
  const [linksError,setLinksError]=useState('');
  const [certBusy,setCertBusy]=useState(false);
  const saving=useRef(false);

  const dirty=Boolean(draft&&baseline&&JSON.stringify(draft)!==JSON.stringify(baseline));
  // 改动停顿 2.5 秒后自动暂存，避免误刷新丢失填写内容。
  useEffect(()=>{
    if(editing||!draft||!baseline||!dirty||saving.current)return;
    const timer=setTimeout(async()=>{
      if(saving.current)return;
      try{const saved=await api.saveProductDraft('vehicle',draft,draftVersion);setDraftVersion(saved.version);setBaseline(draft)}catch(_){}
    },2500);
    return ()=>clearTimeout(timer);
  },[draft,baseline,draftVersion,dirty,editing]);
  const reportDirty=useCallback(value=>onWorkspaceDirtyChange?.(workspaceKey,value),[onWorkspaceDirtyChange,workspaceKey]);
  useEffect(()=>{reportDirty(dirty)},[reportDirty,dirty]);

  // 与新建共用同一套草稿结构：编辑时把已有主档 + SKU 回填为同形状的 draft。
  const skuKeysOf=useCallback(product=>[...new Set((product.skus||[]).filter(s=>!s.disabled).map(s=>s.spec+'|'+s.color+'|'+(s.region||'EUR')))],[]);
  const hydrateFromProduct=useCallback(product=>{
    const skus=(Array.isArray(product.skus)?product.skus:[]).filter(s=>!s.disabled);
    const model=String(product.model||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
    const next={...blank(),id:product.id,kind:'vehicle',name:product.name||'',model,platform:product.platform||'',productType:VEHICLE_TYPE,ownership:model,status:product.status||'启用',uses:product.uses||[],specs:product.specs||{},fitments:[],bom:{version:'V1.0',items:[]},images:[]};
    next.skuSpecSelection=[...new Set(skus.map(s=>s.spec))].slice(0,1);
    next.skuColorSelection=[...new Set(skus.map(s=>s.color))];
    next.skuRegionSelection=skus[0]?.region||'EUR';
    next.skus=skus.map(s=>({spec:s.spec,color:s.color,region:s.region||'EUR'}));
    return next;
  },[]);

  useEffect(()=>{
    let active=true;
    if(editing){
      Promise.all([api.product(productId),api.fields(),api.colors(),api.products('vehicle')])
        .then(([product,f,c,vehicles])=>{if(!active)return;const initial=hydrateFromProduct(product);setDraft(initial);setBaseline(initial);setFields(f);setColors(c);setVehicles(vehicles);setServerSkuKeys(skuKeysOf(product));setSourceProduct(product)})
        .catch(e=>{if(active)setError('加载失败：'+e.message)});
      return()=>{active=false};
    }
    Promise.all([api.productDraft('vehicle'),api.fields(),api.colors(),api.products('vehicle')])
      .then(async([saved,f,c,vehicles])=>{
        let current=saved;
        if(current){
          if(needsDraftIdentityRecovery(current.draft)){
            try{await api.product(current.draft.id);await api.deleteProductDraft('vehicle',current.version);current=null}catch(e){
              if(e.status!==400&&e.status!==404)throw e;
              await recoverDraftIdentity(current.draft,async id=>{try{await api.product(id);return true}catch(error){if(error.status===400||error.status===404)return false;throw error}},async recovered=>{const next=await api.saveProductDraft('vehicle',recovered,current.version);current={...current,draft:recovered,version:next.version}});
            }
          }else{try{await api.product(current.draft.id);await api.deleteProductDraft('vehicle',current.version);current=null}catch(e){if(e.status!==404)throw e}}
        }
        if(!active)return;
        const initial=current?.draft||blank();
        initial.productType=VEHICLE_TYPE;
        // 恢复草稿时同样清洗车型段，避免历史空格/小写导致生成的 SKU 非法。
        initial.model=String(initial.model||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
        initial.ownership=initial.model;
        const validColors=new Set((c||[]).map(x=>x.code));
        // 历史草稿可能把法规码（如 EUR）误写进颜色，保存时必然被后端拒绝；恢复时先剔除非法颜色。
        initial.skus=(initial.skus||[]).filter(s=>validColors.has(s.color)).map(s=>({...s,region:s.region||initial.skuRegionSelection||'EUR'}));
        initial.skuSpecSelection=(initial.skuSpecSelection||[...new Set(initial.skus.map(s=>s.spec))]).slice(0,1);
        initial.skuColorSelection=[...new Set(initial.skuColorSelection||[])].filter(code=>validColors.has(code));
        if(!initial.skuColorSelection.length)initial.skuColorSelection=[...new Set(initial.skus.map(s=>s.color))];
        initial.skuRegionSelection=initial.skuRegionSelection||initial.skus[0]?.region||'EUR';
        setDraft(initial);setBaseline(initial);setDraftVersion(current?.version||0);
        setFields(f);setColors(c);setVehicles(vehicles);
        if(current)setMessage('已从云端恢复暂存');
      })
      .catch(e=>{if(active)setError('加载失败：'+e.message)});
    return()=>{active=false};
  },[editing,productId,hydrateFromProduct]);

  const set=(key,value)=>setDraft(d=>({...d,[key]:value}));
  const notify=(msg,isErr)=>{if(isErr)setError(msg);else setMessage(msg);onNotify?.(msg,isErr)};
  const reloadSource=useCallback(async()=>{if(!productId)return;try{setSourceProduct(await api.product(productId))}catch(e){setError('刷新失败：'+e.message)}},[productId]);
  useEffect(()=>{
    if(!editing||!productId)return;
    let active=true;
    api.productExternalLinks(productId)
      .then(r=>{if(active)setExternalLinks(Array.isArray(r?.links)?r.links:[])})
      .catch(()=>{});
    return()=>{active=false};
  },[editing,productId]);
  const openLinks=()=>{
    setLinksDraft(externalLinks.length?externalLinks.map(row=>({...row})):[{label:'',url:'',note:''}]);
    setLinksError('');setLinksOpen(true);
  };
  const saveLinks=async()=>{
    setLinksError('');
    const rows=linksDraft
      .map(row=>({label:String(row.label||'').trim(),url:String(row.url||'').trim(),note:String(row.note||'').trim()}))
      .filter(row=>row.label||row.url);
    if(rows.some(row=>!row.label||!row.url)){setLinksError('每条链接都要填写名称和网址；不需要的请删除该行');return}
    setLinksBusy(true);
    try{
      const res=await api.saveProductExternalLinks(productId,rows);
      setExternalLinks(Array.isArray(res?.links)?res.links:rows);
      setLinksOpen(false);setMessage('第三方链接已保存');
    }catch(e){setLinksError(e.message||'保存失败')}
    finally{setLinksBusy(false)}
  };
  // 认证文件与产品图片共用媒体库，按 contentType 区分：image/* 为图片，其余为认证资料。
  const certDocs=(sourceProduct?.images||[]).filter(i=>i.contentType&&!/^image\//.test(i.contentType));
  const uploadCert=async e=>{const file=e.target.files?.[0];if(!file||!productId)return;setCertBusy(true);try{await api.uploadMedia(productId,file);await reloadSource();notify(`已归档 ${file.name}`)}catch(err){notify('归档失败：'+err.message,true)}finally{setCertBusy(false);e.target.value=''}};

  const trimField=useMemo(()=>fields.find(f=>f.code==='trim_code'&&f.enabled!==false),[fields]);
  const regionField=useMemo(()=>fields.find(f=>f.code==='region_code'&&f.enabled!==false),[fields]);
  // 后台字段标准库可覆盖内置默认值。
  const trimOptions=useMemo(()=>{
    const list=(trimField?.options||[]).filter(value=>/^[A-Z0-9]{3}$/.test(value));
    return list.length?[...new Set(list)]:DEFAULT_TRIMS;
  },[trimField]);
  const regionOptions=useMemo(()=>{
    const list=(regionField?.options||[]).filter(value=>/^[A-Z0-9]{3}$/.test(value));
    return list.length?[...new Set(list)]:DEFAULT_REGIONS;
  },[regionField]);
  const [newSpec,setNewSpec]=useState('');
  const colorChoices=useMemo(()=>colors.filter(c=>c.enabled&&c.code!=='STD'),[colors]);
  const tplFields=useMemo(()=>fields.filter(f=>f.enabled&&f.level==='product'&&(f.templates||[]).includes(VEHICLE_TYPE)),[fields]);
  // 唯一性按「车型代际+配置版本」判定（与服务端一致）：同代际下配置版本重叠才算冲突，A1S/A1U 代际归一为 A1。
  const duplicate=useMemo(()=>{
    const fam=vehicleFamilyOf(draft?.model);if(!fam)return null;
    const specs=new Set((draft.skus||[]).map(s=>s.spec));
    return vehicles.find(v=>v.id!==draft.id&&vehicleFamilyOf(v.model)===fam&&(v.skus||[]).some(s=>specs.has(s.spec)))||null;
  },[vehicles,draft]);
  const specLabelOf=value=>`${value} · ${TRIM_DESC[value]||'自定义配置'}`;
  const specText=value=>specLabelOf(value);
  const colorLabel=color=>`${color.code} | ${color.zh}${color.en?` (${color.en})`:''}`;
  const colorOf=code=>colors.find(c=>c.code===code);
  const capacityText=draft?.specs?.battery_capacity||'按整车技术参数维护';

  // 欧盟 EN 15194 法定红线：超限直接阻断保存，避免录入违规车辆。
  const complianceIssues=useMemo(()=>{
    const s=draft?.specs||{};const out=[];
    const power=Number(s.rated_power_w);
    if(power&&power>250)out.push(`额定功率 ${power}W 超过 250W 上限`);
    const speed=Number(s.max_assist_speed_kmh);
    if(speed&&speed>25)out.push(`助力切断时速 ${speed}km/h 超过 25km/h，属轻便摩托车`);
    const voltage=Number(s.electrical_voltage);
    if(voltage&&voltage>48)out.push(`标称电压 ${voltage}V 超过 48V 安全特低电压上限`);
    return out;
  },[draft?.specs]);

  const setModel=value=>{
    // 车型段允许 2-3 位；生成 SKU 时会自动取车系代际（A1S/A1U → A1）。
    const model=String(value||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
    setDraft(d=>({...d,model,ownership:model}));
  };

  const toggle=(key,value,checked)=>setDraft(d=>{
    const specs=new Set(d.skuSpecSelection||[]),picked=new Set(d.skuColorSelection||[]);
    if(key==='spec'){
      if(checked){specs.clear();specs.add(value);}else specs.delete(value);
    }else{
      if(checked)picked.add(value);else picked.delete(value);
    }
    const trim=[...specs][0]||'',region=key==='region'?value:(d.skuRegionSelection||'EUR');
    return{...d,skuSpecSelection:trim?[trim]:[],skuColorSelection:[...picked],skuRegionSelection:region,
      skus:trim?[...picked].map(color=>({spec:trim,color,region})):[]};
  });

  const saveLocal=async()=>{
    setError('');
    try{const saved=await api.saveProductDraft('vehicle',draft,draftVersion);setDraftVersion(saved.version);setBaseline(draft);return saved.version}
    catch(e){setError(e.message||'云端暂存失败');return null}
  };

  const finish=async()=>{
    if(saving.current)return;
    setError('');setMessage('');
    const marks={};
    if(!draft.name.trim())marks.name=true;
    if(!MODEL_RE.test(draft.model))marks.model=true;
    if(!(draft.skuSpecSelection||[]).length)marks.spec=true;
    if(!(draft.skuColorSelection||[]).length)marks.color=true;
    if(!/^[A-Z0-9]{3}$/.test(draft.skuRegionSelection||''))marks.region=true;
    const missing=tplFields.filter(f=>f.code!=='compliance_standard'&&f.required&&!String(draft.specs[f.code]??'').trim());
    missing.forEach(f=>{marks['spec:'+f.code]=true});
    if(Object.keys(marks).length){
      if(marks.name||marks.model||marks.spec||marks.color||marks.region)setTab('basic');
      else setTab(missing.every(f=>COMPLIANCE_CODES.includes(f.code))?'compliance':'basic');
      setInvalid(marks);
      const parts=[];
      if(marks.name)parts.push('产品中文名称');
      if(marks.model)parts.push('车型代际（2-3 位大写字母或数字）');
      if(marks.spec)parts.push('配置版本');
      if(marks.color)parts.push('外观颜色');
      if(marks.region)parts.push('市场法规');
      missing.forEach(f=>parts.push(f.nameZh));
      setError('以下内容未填写或不合规：'+parts.join('、'));onNotify?.('保存失败：以下内容未填写或不合规 — '+parts.join('、'),true);
      setTimeout(()=>document.querySelector('.invalid')?.scrollIntoView({behavior:'smooth',block:'center'}),30);
      return;
    }
    setInvalid({});
    // SEO 商品 ID 会直接变成商城 URL（/de/e-bikes/{id}）：格式不合规就不让保存，
    // 否则服务端拒绝、或者带着空格/大写进库，都会让前台链接打不开。
    const seoId=seoProductIdOf(draft);
    if(seoId&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seoId)){
      setError('SEO 商品 ID 只能包含小写字母、数字和单个短横线，且不能以短横线开头或结尾（示例：carbon-e-bike-klapprad-a1）');
      onNotify?.('保存失败：SEO 商品 ID 格式不合规',true);
      return;
    }
    const enabledColors=new Set((colors||[]).map(c=>c.code));
    const badColor=draft.skus.find(s=>!enabledColors.has(s.color));
    if(badColor){notify(`保存失败：颜色 ${badColor.color} 不是已启用的外观颜色，请在第 3 步重新选择`,true);setTab('basic');return}
    const badCode=draft.skus.find(s=>!buildVehicleSku(draft.model,s.spec,s.color,s.region||draft.skuRegionSelection||'EUR'));
    if(badCode){notify(`保存失败：生成的 SKU 编码无效：${badCode.spec}-${badCode.color}-${badCode.region||draft.skuRegionSelection}，请检查车型代际（2-3 位）、配置版本、颜色与法规是否均为 3 位大写编码`,true);return}
    if(complianceIssues.length){notify('保存失败：欧盟 EN 15194 合规校验未通过 — '+complianceIssues.join('；'),true);return}
    // 新建时若该配置版本已归属其他主档，先让用户选择：追加到已有主档，或单独新建独立主档。
    if(!editing&&duplicate&&!trimChoice.current){setTrimPrompt({target:duplicate});return}
    const appendToExisting=!editing&&trimChoice.current==='append';
    const createSeparate=!editing&&trimChoice.current==='new';
    // 主档已存在（编辑或车型代号重复）时，保存以本次勾选为准；组合有差异先二次确认再替换。
    const exists=editing;
    const baseKeys=editing?new Set(serverSkuKeys):new Set();
    const nextKeys=new Set(draft.skus.map(s=>s.spec+'|'+s.color+'|'+(s.region||draft.skuRegionSelection||'EUR')));
    const removing=[...baseKeys].some(k=>!nextKeys.has(k));
    if(exists&&!forceReplace.current&&removing){
      setReplacePrompt({existing:baseKeys.size,next:nextKeys.size});
      return;
    }
    saving.current=true;setBusy(true);
    try{
      let savedVersion=draftVersion;
      if(!editing){
        savedVersion=await saveLocal();
        if(savedVersion===null)return;
      }
      // 保存主档时带上最新的第三方链接，避免草稿里的旧快照把链接配置覆盖回去。
      const specs={...draft.specs,_seoProductId:seoProductIdOf(draft),...(editing?{_externalLinks:externalLinks}:{}),compliance_standard:draft.specs.compliance_standard||COMPLIANCE_STANDARD};
      const payload={...draft,editing:Boolean(exists||appendToExisting),newMaster:createSeparate,appendToId:appendToExisting?(appendTarget.current||undefined):undefined,replaceSkus:Boolean(exists),productType:VEHICLE_TYPE,ownership:draft.model,specs,fitments:[],images:[]};
      const response=await adminFetch('/api/products/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'保存失败');
      if(editing){
        setBaseline(draft);
        notify(`保存成功${result.appended?`：新增 ${result.appended} 个物理 SKU`:'：主档信息已更新'}`);
        const fresh=await api.product(productId);
        const next=hydrateFromProduct(fresh);
        setDraft(next);setBaseline(next);setServerSkuKeys(skuKeysOf(fresh));forceReplace.current=false;
      }else{
        try{await api.deleteProductDraft('vehicle',savedVersion)}catch(_){}
        trimChoice.current=null;appendTarget.current=null;setTrimPrompt(null);
        onCreated?.(result);
      }
    }catch(e){notify(e.message,true)}finally{saving.current=false;setBusy(false)}
  };

  const addColor=async()=>{
    const code=String(newColor?.code||'').replace(/\s+/g,'').toUpperCase();
    const zh=String(newColor?.zh||'').trim();
    const en=String(newColor?.en||'').trim();
    if(!/^[A-Z0-9]{3}$/.test(code)){setError('颜色代码必须为 3 位大写字母或数字');return}
    if(!zh){setError('请填写颜色中文名');return}
    setError('');
    try{
      await api.addColor({code,zh,en,de:'',hex:newColor?.hex||'#cccccc',ral:newColor?.ral||'',sort:60});
      const list=await api.colors();setColors(list);
      setDraft(d=>{
        const picked=[...new Set([...d.skuColorSelection,code])],trim=(d.skuSpecSelection||[])[0];
        return{...d,skuColorSelection:picked,skus:trim?picked.map(color=>({spec:trim,color,region:d.skuRegionSelection||'EUR'})):[]};
      });
      setNewColor(null);setMessage(`已新增颜色 ${code}`);
    }catch(e){setError(e.message||'颜色新增失败')}
  };

  const addSpec=()=>{
    const code=String(newSpec||'').replace(/\s+/g,'').toUpperCase();
    if(!/^[A-Z0-9]{3}$/.test(code)){setError('配置版本必须为 3 位大写字母或数字，例如 ULT、PRO、STD');return}
    setError('');
    setDraft(d=>{
      const region=d.skuRegionSelection||'EUR';
      return{...d,skuSpecSelection:[code],skus:(d.skuColorSelection||[]).map(color=>({spec:code,color,region}))};
    });
    clearInvalid('spec');setNewSpec('');
  };

  if(!draft)return <div className="hint" />;

  const fieldByCode=new Map(tplFields.map(f=>[f.code,f]));
  const groupedCodes=new Set([...HW_GROUPS.flatMap(g=>g.codes),...COMPLIANCE_CODES]);
  const otherFields=tplFields.filter(f=>!groupedCodes.has(f.code)&&f.code!=='battery_capacity');
  // 待补字段提醒：仅针对系统已定义的硬件字段，值为空即视为待补；只提醒不阻断保存。
  const missingHW=[
    ...HW_GROUPS.flatMap(g=>g.codes.map(code=>({group:g,def:fieldByCode.get(code)}))),
    ...COMPLIANCE_CODES.map(code=>({group:null,def:fieldByCode.get(code)})),
  ].filter(x=>x.def&&(draft.specs[x.def.code]==null||String(draft.specs[x.def.code]).trim()===''));
  const missingByGroup=new Map(HW_GROUPS.map(g=>[g.key,missingHW.filter(x=>x.group&&x.group.key===g.key).length]));
  const renderField=f=>{
    const value=draft.specs[f.code]??'';
    if(f.code==='compliance_standard')return <div className="field" key={f.code}>
      <label>{f.nameZh} * <span className="lock-badge">✔ 系统锁定</span></label>
      <input className="mono" value={value||COMPLIANCE_STANDARD} readOnly/>
    </div>;
    return <div className={'field'+(invalid['spec:'+f.code]?' invalid':'')} key={f.code}>
      <label>{f.nameZh}{f.unit?`（${f.unit}）`:''}{f.required?' *':''}</label>
      {f.type==='enum'
        ?<select value={value} onChange={e=>{set('specs',{...draft.specs,[f.code]:e.target.value});clearInvalid('spec:'+f.code)}}><option value="">— 选择 —</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>
        :<input type={f.type==='number'?'number':'text'} value={value} onChange={e=>{set('specs',{...draft.specs,[f.code]:e.target.value});clearInvalid('spec:'+f.code)}}/>}
    </div>;
  };

  const modelDone=MODEL_RE.test(draft.model);
  const specDone=(draft.skuSpecSelection||[]).length>0;
  const colorDone=(draft.skuColorSelection||[]).length>0;
  const regionDone=/^[A-Z0-9]{3}$/.test(draft.skuRegionSelection||'');
  const labelSku=draft.skus[0];
  const labelColor=labelSku?colorOf(labelSku.color):null;
  const labelCode=labelSku?buildVehicleSku(draft.model,labelSku.spec,labelSku.color,labelSku.region||draft.skuRegionSelection||'EUR'):'';
  // SEO 商品 ID 的建议只在「与当前值不同」时提示。
  // 已经采用建议或手填成同一值时，再挂一个「采用建议」按钮没有任何信息量，
  // 只会让人误点（点完看起来也没变化，反而怀疑没保存），因此直接不显示。
  const seoSuggestion=seoSuggestionOf(draft);
  const seoPending=seoSuggestion&&seoSuggestion!==seoProductIdOf(draft)?seoSuggestion:'';

  // 第三方链接模板：按当前产品替换占位符，打开的就是「对应产品」的工厂资料页。
  const linkValues={model:draft.model,name:draft.name,sku:labelCode,id:productId||draft.id||''};
  const resolveLinkUrl=template=>String(template||'').replace(/\{(model|name|sku|id)\}/g,(_,key)=>encodeURIComponent(String(linkValues[key]||'')));
  // 列表「来源」列：常见工厂站点给中文标签，其余显示域名。
  const linkSource=template=>{
    const host=String(template||'').replace(/^https?:\/\//i,'').split('/')[0].toLowerCase().replace(/^www\./,'');
    if(host.endsWith('1688.com'))return '1688 货源';
    if(host.endsWith('naicisports.com'))return '工厂官网';
    if(host.endsWith('alibaba.com'))return '阿里国际';
    return host||'外部站点';
  };

  return <div className="wizard">
    <div className="editor-head">
      <button className="btn small" onClick={onBack}>← 返回列表</button>
      <h2 />
      <span className="hint" />
      {editing&&draft.status==='停用'&&<div className="notice">该车型当前为「停用」状态，保存修改不会自动启用；恢复销售请在列表点「启用」。</div>}
      <div className="head-tools">
        <button className="btn small" onClick={()=>setShowFields(true)}>字段标准库</button>
        <button className="btn small" onClick={()=>setShowColors(true)}>颜色字典</button>
        <button className="btn small" disabled={busy||editing} onClick={saveLocal}>暂存草稿</button>
        <button className="btn small primary" disabled={busy} onClick={finish}>{busy?'正在保存…':(editing?'保存修改':'一键保存车型与物理物料')}</button>
      </div>
    </div>

    <div className="tabs">
      {[['basic','产品信息'],['bom','工程 BOM 主档'],['compliance','认证与合规文件'],['factory','工厂官方网站信息']].map(([key,label])=>
        <button type="button" key={key} className={'tab'+(tab===key?' active':'')} onClick={()=>setTab(key)}>{label}</button>)}
    </div>

    {tab==='basic'&&<>
    <div className="wizard-layout">
      <div className="wizard-main">
        <div className="card">
          <div className="card-title">基础信息</div>
          <div className="form-grid">
            <div className={'field'+(invalid.name?' invalid':'')}><label>产品中文名称 *</label><input value={draft.name} placeholder="例如 ALSVID A1 折叠电动自行车" onChange={e=>{set('name',e.target.value);clearInvalid('name')}}/></div>
            <div className="field"><label>技术平台</label><select value={draft.platform||''} onChange={e=>set('platform',e.target.value)}><option value="">— 未指定 —</option>{(meta.platforms||[]).filter(p=>p.enabled!==false).map(p=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select></div>
            <div className="field"><label>档案状态</label><select value={draft.status} onChange={e=>set('status',e.target.value)}><option>启用</option><option>停用</option></select></div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">四段式 SKU 配置器</div>
          <p className="hint" />
          <div className="seg-grid">
            <div className={'seg-card'+(modelDone?' done':'')+(invalid.model?' invalid':'')}>
              <div className="seg-head"><span className="seg-index">1</span>车型代际
                {modelDone&&<span className="lock-badge">✔ 编码有效</span>}
              </div>
              <input className="seg-input mono" maxLength={3} value={draft.model} placeholder="A1" onChange={e=>{setModel(e.target.value);clearInvalid('model')}} onBlur={()=>{if(duplicate)setMessage(`车型 ${duplicate.model} 已包含相同配置版本：保存时会询问你——追加到该主档，还是单独新建。`)}}/>                
              <div className="hint" />
              {duplicate&&<div className="notice">车型 {duplicate.model} 已包含相同配置版本：保存时可选择「追加到该主档」或「单独新建」。</div>}
            </div>

            <div className={'seg-card'+(specDone?' done':'')+(invalid.spec?' invalid':'')}>
              <div className="seg-head"><span className="seg-index">2</span>配置版本</div>
              <div className="choice-group">
                {trimOptions.map(trim=>{
                  const on=(draft.skuSpecSelection||[])[0]===trim;
                  return <button type="button" key={trim} className={'choice'+(on?' on':'')}
                    onClick={()=>{toggle('spec',trim,true);clearInvalid('spec')}}>
                    <b className="mono-strong">{trim}</b>{TRIM_DESC[trim]||'自定义配置'}
                  </button>;
                })}
              </div>
              <div className="color-form" style={{marginTop:8}}>
                <input placeholder="自定义 3 位编码，如 ULT" maxLength={3} value={newSpec} onChange={e=>setNewSpec(e.target.value.toUpperCase())}/>
                <button type="button" className="btn small" onClick={addSpec}>+ 使用自定义版本</button>
              </div>
              <div className="hint" />
            </div>

            <div className={'seg-card'+(colorDone?' done':'')+(invalid.color?' invalid':'')}>
              <div className="seg-head"><span className="seg-index">3</span>外观颜色</div>
              <div className="choice-group">
                {colorChoices.map(color=><label key={color.code} className={'choice'+((draft.skuColorSelection||[]).includes(color.code)?' on':'')}>
                  <input type="checkbox" checked={(draft.skuColorSelection||[]).includes(color.code)} onChange={e=>{toggle('color',color.code,e.target.checked);clearInvalid('color')}}/>
                  <span className="swatch" style={{background:color.hex||'#ddd'}}/>{colorLabel(color)}
                </label>)}
                <button type="button" className="choice add" onClick={()=>setNewColor({code:'',zh:'',en:'',hex:'#cccccc',ral:''})}>+ 自定义新颜色</button>
              </div>
              {newColor&&<div className="color-form">
                <input placeholder="代码（3 位）" maxLength={3} value={newColor.code} onChange={e=>setNewColor({...newColor,code:e.target.value.toUpperCase()})}/>
                <input placeholder="中文名" value={newColor.zh} onChange={e=>setNewColor({...newColor,zh:e.target.value})}/>
                <input placeholder="英文名" value={newColor.en} onChange={e=>setNewColor({...newColor,en:e.target.value})}/>
                <input placeholder="RAL 色号（如 RAL 9005）" value={newColor.ral||''} onChange={e=>setNewColor({...newColor,ral:e.target.value})}/>
                <input type="color" value={newColor.hex} onChange={e=>setNewColor({...newColor,hex:e.target.value})}/>
                <button className="btn small" onClick={addColor}>新增</button>
                <button className="btn small" onClick={()=>setNewColor(null)}>取消</button>
              </div>}
            </div>

            <div className={'seg-card'+(regionDone?' done':'')+(invalid.region?' invalid':'')}>
              <div className="seg-head"><span className="seg-index">4</span>市场法规</div>
              <div className="choice-group">
                {regionOptions.map(region=>{
                  const on=(draft.skuRegionSelection||'EUR')===region;
                  return <button type="button" key={region} className={'choice'+(on?' on':'')}
                    onClick={()=>{toggle('region',region,true);clearInvalid('region')}}>
                    <b className="mono-strong">{region}</b>{REGION_DESC[region]||'自定义法规'}
                  </button>;
                })}
              </div>
              <div className="hint" />
            </div>
          </div>
        </div>

      </div>

      <aside className="wizard-side">
        <div className="card side-card">
          <div className="card-title">SEO 商品 ID</div>
          <div className="hint" style={{marginBottom:8}}>该 ID 就是商城商品地址（/de/e-bikes/…），也是前台唯一的商品入口；保存后自动同步到各渠道商品链接。</div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>市场</th><th>SEO 商品 ID</th><th>操作</th></tr></thead>
              <tbody><tr>
                <td>德国<br/><small>de-DE</small></td>
                <td><input className="mono" aria-label="德国市场 SEO 商品 ID" value={seoProductIdOf(draft)} placeholder="输入 SEO 商品 ID" style={{width:'100%'}} onChange={e=>setDraft(d=>({...d,specs:{...d.specs,_seoProductId:e.target.value.toLowerCase()}}))}/>{seoPending&&<div className="hint" style={{overflowWrap:'anywhere'}}>建议：{seoPending}</div>}</td>
                <td>{seoPending?<button type="button" className="btn" title={seoPending} onClick={()=>setDraft(d=>({...d,specs:{...d.specs,_seoProductId:seoPending}}))}>采用建议</button>:'—'}</td>
              </tr></tbody>
            </table>
          </div>
        </div>
        <div className="card side-card">
          <div className="card-title with-tag">物理物料明细 (Physical SKUs)<span className="tag">{draft.skus.length} 个有效物料</span></div>
          <p className="hint" />
          {draft.skus.length===0
            ? <div className="sku-empty">等待组合生成：请在第 2、3、4 段选择配置版本、颜色与法规。</div>
            : <div className="sku-plan">
                <div className="sku-plan-head"><span>SKU</span><span>配置版本</span><span>外观颜色</span><span>法规</span></div>
                {draft.skus.map(row=>{
                const code=buildVehicleSku(draft.model,row.spec,row.color,row.region||draft.skuRegionSelection||'EUR');
                const color=colorOf(row.color)||{code:row.color,zh:row.color,hex:'#cbd5e1'};
                return <div className="sku-plan-row" key={row.spec+'|'+row.color+'|'+(row.region||'EUR')}>
                  <span className={'sku-code'+(code?'':' bad')}>{code||'编码不完整'}</span>
                  <span className="sku-plan-cell" title={row.spec}>{specText(row.spec)}</span>
                  <span className="sku-plan-cell">{color.zh||color.code}{color.ral?` / ${color.ral}`:''}</span>
                  <span className="sku-plan-cell">{row.region||draft.skuRegionSelection||'EUR'}</span>
                </div>;
              })}</div>}
        </div>

        <div className="card side-card barcode-card">
          <div className="card-title">外箱条码标签（预览）</div>
          {labelSku&&labelCode
            ? <>
                <div className="label-brand">ALSVID</div>
                <div className="label-model">{draft.name||'未填写产品名称'}</div>
                <div className="label-meta">{labelColor?`${labelColor.de||labelColor.en||''} / ${labelColor.en||''}`.trim():''}</div>
                <BarcodeLabel value={labelCode}/>
                <div className="label-sku mono">{labelCode}</div>
                <div className="hint" />
              </>
            : <div className="barcode-empty">补全车型代际（2-3 位）、配置版本、颜色与法规（各 3 位）后自动生成外箱条码</div>}
        </div>
      </aside>
    </div>
    <div className="hw-panel">
      <div className="card">
        <div className="card-title">整车硬件工程参数 <span className="tag">按系统模块归类</span></div>
        <p className="hint" />
        {complianceIssues.length>0&&<div className="notice warn">⚠ 违规风险：{complianceIssues.join('；')}</div>}
        {missingHW.length>0&&<div className="notice">
          <b>待补字段 {missingHW.length} 项</b>：{missingHW.map(x=>x.def.nameZh||x.def.code).join('、')}
          <div className="hint mt8" />
        </div>}
        {missingHW.length===0&&<div className="notice ok">✔ 所有硬件参数字段均已填写完整</div>}
      </div>
      <div className="hw-grid">
        {HW_GROUPS.map(group=>{
          const list=group.codes.map(code=>fieldByCode.get(code)).filter(Boolean);
          return <div className="hw-card" key={group.key}>
            <div className="hw-card-head"><span className="hw-icon">{group.icon}</span><b>{group.title}</b><span>{group.sub}</span>{missingByGroup.get(group.key)>0&&<span className="tag">待补 {missingByGroup.get(group.key)}</span>}</div>
            <div className="hw-fields">
              {group.key==='battery'&&<div className="field"><label>电池配置（按技术参数）</label><input value={capacityText} readOnly/></div>}
              {list.map(renderField)}
            </div>
          </div>;
        })}
        {otherFields.length>0&&<div className="hw-card">
          <div className="hw-card-head"><b>其他参数</b><span>Other</span></div>
          <div className="hw-fields">{otherFields.map(renderField)}</div>
        </div>}
      </div>
    </div>
    </>}

    {tab==='bom'&&(sourceProduct
      ? <VehicleBomPanel p={sourceProduct} meta={meta} onChanged={reloadSource} notify={notify}/>
      : <div className="card"><div className="card-title">工程 BOM 主档</div><div className="notice">请先在「产品信息」保存车型，再维护工程 BOM 与版本。</div></div>)}

    {tab==='compliance'&&<div className="hw-panel">
      <div className="card">
        <div className="card-title">合规与资质 <span className="tag">{COMPLIANCE_STANDARD}</span></div>
        <p className="hint" />
        {complianceIssues.length>0&&<div className="notice warn">⚠ 违规风险：{complianceIssues.join('；')}</div>}
        <div className="hw-fields">
          {COMPLIANCE_CODES.map(code=>fieldByCode.get(code)).filter(Boolean).map(renderField)}
        </div>
      </div>
      {sourceProduct&&<div className="card">
        <div className="card-title">认证资料归档 <span className="tag">CE / UN 38.3 / MSDS</span></div>
        <p className="hint" />
        <div className="row">
          <label className={'btn primary'+(certBusy?' disabled':'')}>{certBusy?'上传中…':'上传认证文件'}<input type="file" hidden disabled={certBusy} onChange={uploadCert}/></label>
          <span className="hint" />
        </div>
        {certDocs.length?<table className="table mt12"><thead><tr><th>文件</th><th>类型</th><th>操作</th></tr></thead><tbody>{certDocs.map(doc=><tr key={doc.id}><td>{doc.label||doc.key}</td><td className="hint" /><td><a className="link-action" href={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer">下载 / 查看</a></td></tr>)}</tbody></table>:<div className="hint mt8" />}
      </div>}
      {sourceProduct&&<ImagesTab p={sourceProduct} onChanged={reloadSource} notify={notify}/>}
    </div>}

    {tab==='factory'&&<div className="factory-panel">
      <div className="card">
        <div className="factory-head">
          <div>
            <div className="card-title">工厂官方网站信息 <span className="tag">{externalLinks.length} 条</span></div>
            <p className="hint" />
          </div>
          {editing&&<button type="button" className="btn small primary" onClick={openLinks}>{externalLinks.length?'管理链接':'＋ 添加链接'}</button>}
        </div>
        {!editing?<div className="notice mt12">请先保存车型，再登记本产品的工厂官方网站信息。</div>
          :externalLinks.length?<table className="table mt12">
            <thead><tr><th style={{width:'48px'}}>#</th><th style={{width:'170px'}}>名称</th><th style={{width:'140px'}}>来源</th><th>网址</th><th style={{width:'96px'}}>操作</th></tr></thead>
            <tbody>{externalLinks.map((link,index)=>{
              const url=resolveLinkUrl(link.url);
              return <tr key={`${link.label}-${index}`}>
                <td className="hint" />
                <td><b>{link.label}</b>{link.note&&<div className="hint" />}</td>
                <td><span className="tag">{linkSource(link.url)}</span></td>
                <td><a className="link-action factory-link-url mono" href={url} target="_blank" rel="noopener noreferrer" title={url}>{url}</a></td>
                <td><a className="btn small" href={url} target="_blank" rel="noopener noreferrer">打开 ↗</a></td>
              </tr>;
            })}</tbody>
          </table>
          :<div className="notice mt12">还没有登记工厂官方网站信息。点击「＋ 添加链接」录入 1688 货源页、工厂官网产品页等第三方资料。</div>}
        <div className="factory-foot hint" />
      </div>
    </div>}

    {error&&<p className="error-text mt8">{error}</p>}
    {message&&<p className="hint mt8" />}

    {trimPrompt&&<div className="confirm-mask">
      <div className="confirm-box">
        <div className="confirm-title">该配置版本已归属其他车型</div>
        <p className="confirm-text">车型代际 <b>{draft.model}</b> 的配置版本 <b>{[...new Set(draft.skus.map(s=>s.spec))].join(' / ')}</b> 已属于主档 <b>{trimPrompt.target.name}</b>（代号 {trimPrompt.target.model}）。</p>
        <p className="confirm-hint" />
        <div className="confirm-actions">
          <button type="button" className="btn ghost" onClick={()=>{setTrimPrompt(null);trimChoice.current=null;appendTarget.current=null}}>返回修改</button>
          <button type="button" className="btn" onClick={()=>{const t=trimPrompt.target;setTrimPrompt(null);trimChoice.current='append';appendTarget.current=t.id;finish()}}>保存到该主档</button>
          <button type="button" className="btn primary" onClick={()=>{setTrimPrompt(null);trimChoice.current='new';appendTarget.current=null;finish()}}>单独新建</button>
        </div>
      </div>
    </div>}
    {replacePrompt&&<div className="confirm-mask">
      <div className="confirm-box">
        <div className="confirm-title">物理物料数量发生变化</div>
        <p className="confirm-text">原主档有 <b>{replacePrompt.existing}</b> 个有效物理物料，本次将保存 <b>{replacePrompt.next}</b> 个。</p>
        <p className="confirm-hint" />
        <div className="confirm-actions">
          <button type="button" className="btn ghost" onClick={()=>setReplacePrompt(null)}>返回检查</button>
          <button type="button" className="btn danger" onClick={()=>{setReplacePrompt(null);forceReplace.current=true;finish()}}>确认替换保存</button>
        </div>
      </div>
    </div>}
    {showFields&&<FieldLibDialog onClose={()=>setShowFields(false)} onChanged={()=>{api.fields().then(setFields).catch(()=>{})}}/>}
    {showColors&&<ColorDictDialog onClose={()=>setShowColors(false)} onChanged={()=>{api.colors().then(setColors).catch(()=>{})}}/>}
    {linksOpen&&<div className="mask mask--center" onMouseDown={e=>{if(e.target===e.currentTarget)setLinksOpen(false)}}>
      <div className="modal external-links-modal" role="dialog" aria-modal="true" aria-label="配置第三方链接">
        <div className="modal-head"><h3>工厂官方网站信息 · 链接管理</h3><button type="button" className="btn small" onClick={()=>setLinksOpen(false)} aria-label="关闭">×</button></div>
        <div className="modal-body">
          <p className="hint mb12" />
          <p className="hint link-placeholders mb12" />
          {linksDraft.map((row,i)=><div className="external-link-row" key={i}>
            <input placeholder="名称，如 工厂产品信息" maxLength={40} value={row.label} onChange={e=>setLinksDraft(d=>d.map((r,j)=>j===i?{...r,label:e.target.value}:r))}/>
            <input placeholder="https://factory.example.com/products/{model}" value={row.url} onChange={e=>setLinksDraft(d=>d.map((r,j)=>j===i?{...r,url:e.target.value}:r))}/>
            <button type="button" className="btn small danger" aria-label={`删除第 ${i+1} 条链接`} onClick={()=>setLinksDraft(d=>d.filter((_,j)=>j!==i))}>×</button>
          </div>)}
          <button type="button" className="btn small mt8" disabled={linksDraft.length>=10} onClick={()=>setLinksDraft(d=>[...d,{label:'',url:'',note:''}])}>＋ 添加链接</button>
          {linksError&&<p className="error-text mt8" role="alert">{linksError}</p>}
        </div>
        <div className="modal-foot">
          <span className="hint" style={{marginRight:'auto'}} />
          <button type="button" className="btn" onClick={()=>setLinksOpen(false)}>取消</button>
          <button type="button" className="btn primary" disabled={linksBusy} onClick={saveLinks}>{linksBusy?'保存中…':'保存链接'}</button>
        </div>
      </div>
    </div>}
  </div>;
}

/* ---------------- 工程 BOM 主档（精简版） ---------------- */
function VehicleBomPanel({p,meta,onChanged,notify}){
  const defaultVersion=`BOM-${p.model||p.ownership||'MODEL'}-V1.0`;
  const [parts,setParts]=useState([]);
  const [versions,setVersions]=useState([]);
  const [selected,setSelected]=useState('');
  const [bom,setBom]=useState(()=>({version:p.bom?.version||defaultVersion,draftRevision:undefined,items:(p.bom?.items||[]).map(x=>({...x}))}));
  const [savedSnapshot,setSavedSnapshot]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{api.products('part').then(setParts).catch(()=>{})},[]);
  useEffect(()=>{api.bomVersions(p.id).then(setVersions).catch(e=>notify(e.message,true))},[p.id]);
  const partOptions=useMemo(()=>parts.flatMap(x=>(x.skus||[]).map(s=>({sku:s.sku,name:x.name}))),[parts]);
  const dirty=JSON.stringify(bom)!==savedSnapshot;
  const current=versions.find(v=>v.version===selected);
  const status=current?.status==='published'?'Released':'Draft';

  const load=async value=>{
    setSelected(value);
    if(!value)return;
    try{
      const h=await api.bomVersion(p.id,value);
      const loaded={version:h.status==='draft'?h.version:'',draftRevision:h.status==='draft'?h.draftRevision:undefined,items:(h.items||[]).map(x=>({...x}))};
      setBom(loaded);
      setSavedSnapshot(h.status==='draft'?JSON.stringify(loaded):'');
      notify(h.status==='draft'?'已载入草稿，可直接修改':'已载入历史版本，请填写新的版本号后保存');
    }catch(e){notify(e.message,true)}
  };
  const add=()=>setBom(b=>({...b,items:[...b.items,{id:'b-'+Date.now()+'-'+b.items.length,section:(meta.bomSections||[])[0],drawingNo:'D-'+String(b.items.length+1).padStart(3,'0'),sku:'',qty:1,unit:'件',position:'',supplier:'',specRequirement:'',keyControl:false}]}));
  const upd=(i,k,v)=>setBom(b=>({...b,items:b.items.map((it,j)=>j===i?{...it,[k]:v}:it)}));
  const del=i=>{
    if(bom.items.some(x=>String(x.parentItemId||'')===String(bom.items[i].id))){notify('该物料存在下级物料，请先移除下级',true);return}
    setBom(b=>({...b,items:b.items.filter((_,j)=>j!==i)}));
  };
  const save=async()=>{
    if(!bom.version.trim()){notify('请填写 BOM 版本号',true);return}
    if(bom.items.some(it=>!it.sku)){notify('每行必须选择零部件号（Part No）',true);return}
    setBusy(true);
    try{
      const next=await api.saveBom(p.id,{...bom,items:bom.items.map(it=>({...it,drawingNo:it.drawingNo||it.sku}))});
      setBom(next);setSavedSnapshot(JSON.stringify(next));setSelected(next.version);
      setVersions(await api.bomVersions(p.id));
      onChanged?.();
      notify('BOM 已保存 · '+next.version);
    }catch(e){notify(e.message,true)}finally{setBusy(false)}
  };
  const publish=async()=>{
    if(!selected||bom.draftRevision==null){notify('请先保存草稿再发布',true);return}
    setBusy(true);
    try{
      await api.publishBom(p.id,selected,bom.draftRevision);
      setVersions(await api.bomVersions(p.id));
      setSelected('');setSavedSnapshot('');
      onChanged?.();
      notify('BOM 已发布为 Released');
    }catch(e){notify(e.message,true)}finally{setBusy(false)}
  };

  return <div className="card bom-panel">
    <div className="bom-head">
      <div className="bom-title">物料清单
        <span className={'tag'+(status==='Released'?' ok':'')}>{status}</span>
        {dirty&&<span className="bom-dirty">未保存</span>}
      </div>
      <div className="bom-tools">
        <input className="bom-version" value={bom.version} placeholder={defaultVersion} disabled={bom.draftRevision!=null} onChange={e=>setBom({...bom,version:e.target.value.toUpperCase()})}/>
        <select value={selected} onChange={e=>{const v=e.target.value;if(dirty&&!window.confirm('BOM 有未保存修改，切换版本会丢失当前内容。继续吗？'))return;load(v)}}>
          <option value="">历史版本</option>
          {versions.map(v=><option key={v.version} value={v.version}>{v.version} · {v.status}</option>)}
        </select>
        <button type="button" className="btn small" onClick={add}>+ 添加物料行</button>
        <button type="button" className="btn small accent" disabled={busy} onClick={save}>{busy?'保存中…':'保存草稿'}</button>
        <button type="button" className="btn small" disabled={busy||bom.draftRevision==null} onClick={publish}>发布 Released</button>
      </div>
    </div>
    {bom.items.length?<table className="table bom-table">
      <thead><tr><th>零部件号 Part No</th><th>系统模块</th><th>物料名称</th><th>规格要求</th><th>供应商</th><th>用量</th><th>关键管控件</th><th/></tr></thead>
      <tbody>{bom.items.map((it,i)=>{
        const info=partOptions.find(o=>o.sku===it.sku);
        return <tr key={it.id||i}>
          <td><select className="mono" value={it.sku} onChange={e=>upd(i,'sku',e.target.value)}><option value="">— 选择 Part No —</option>{partOptions.map(o=><option key={o.sku} value={o.sku}>{o.sku}</option>)}</select></td>
          <td><select value={it.section} onChange={e=>upd(i,'section',e.target.value)}>{(meta.bomSections||[]).map(s=><option key={s}>{s}</option>)}</select></td>
          <td className="hint" />
          <td><input value={it.specRequirement||''} placeholder="如 T700 碳布 / 36V 10Ah" onChange={e=>upd(i,'specRequirement',e.target.value)}/></td>
          <td><input value={it.supplier||''} placeholder="供应商" onChange={e=>upd(i,'supplier',e.target.value)}/></td>
          <td><input type="number" min="0.01" step="any" className="bom-qty" value={it.qty} onChange={e=>upd(i,'qty',Number(e.target.value))}/></td>
          <td style={{textAlign:'center'}}><input type="checkbox" checked={Boolean(it.keyControl)} onChange={e=>upd(i,'keyControl',e.target.checked)} aria-label="关键管控件"/></td>
          <td><button type="button" className="btn small danger" onClick={()=>del(i)}>删除</button></td>
        </tr>;
      })}</tbody>
    </table>:<div className="bom-empty">BOM 为空。点击「+ 添加物料行」从零配件库引用 Part No，不重复建档。</div>}
    <div className="bom-foot hint" />
  </div>;
}
