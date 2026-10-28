'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => v == null ? '—' : new Intl.NumberFormat('ko-KR', {maximumFractionDigits:1}).format(v);
const cell = (row, col) => row?.[col];
const val = (row, col) => cell(row,col)?.v;
const text = (row,col) => String(val(row,col) ?? '').trim();
const colNo = c => [...c].reduce((n,x)=>n*26+x.charCodeAt(0)-64,0);
const colName = n => {let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const cols = (a,b) => Array.from({length:colNo(b)-colNo(a)+1},(_,i)=>colName(colNo(a)+i));
const clean = s => String(s ?? '').replace(/\s+/g,' ').trim();
const code = s => {const m=String(s).match(/^(\d{2})\s*[- ]/);return m?Number(m[1]):null;};
const validId = v => /^(?:\d{6,14}|TBD\d+)$/i.test(String(v ?? '').trim());
const id = v => String(v??'').trim();
const stageName={new:'신제품',prepare:'출시 준비',out:'EOL',unknown:'상태 확인',active:'판매 중',canceled:'취소 표시'};
let raw, model, tab='shortage', pages={shortage:1,new:1,eol:1}, shownShort=[],shownNew=[],shownEol=[];
const PAGE=40;

function numeric(row,col,blankZero=false){
  const c=cell(row,col);
  if(!c || c.v==null || c.v==='') return c?.f ? null : blankZero?0:null;
  return c.t==='e'||typeof c.v!=='number'||!Number.isFinite(c.v)?null:c.v;
}
function sumCells(row,cs){let n=0;for(const c of cs){const x=numeric(row,c,true);if(x==null)return null;n+=x;}return n;}
function getMonths(rows){
  const monthNums={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  const h=rows['6'],r7=rows['7'];
  if(!h||!r7)throw Error('월별 헤더(6·7행)를 찾을 수 없습니다. 원본 구조를 확인하세요.');
  const blocks=Object.entries(h).filter(([,c])=>/Q.?ty/i.test(String(c.v))).sort((a,b)=>colNo(a[0])-colNo(b[0]));
  if(!blocks.length)throw Error('월별 Q’ty 블록을 찾을 수 없습니다.');
  return blocks.map(([start,c])=>{
    const m=String(c.v).match(/([A-Z]{3})\s*['’]\s*(\d{2,4})/i);
    if(!m||!monthNums[m[1].toUpperCase()])throw Error('인식할 수 없는 월 헤더: '+c.v);
    const year=Number(m[2])+(m[2].length===2?2000:0),month=monthNums[m[1].toUpperCase()];
    const a=colNo(start), close=Object.keys(r7).find(k=>colNo(k)>=a&&colNo(k)<a+12&&/Closing\s*Qty/i.test(clean(r7[k].v)));
    const incoming=Object.keys(r7).find(k=>colNo(k)>=a&&colNo(k)<a+10&&/^Incoming$/i.test(clean(r7[k].v)));
    const sales=Object.keys(r7).find(k=>colNo(k)>=a&&colNo(k)<a+12&&/^Sales$/i.test(clean(r7[k].v)));
    if(!close||!incoming||!sales||!/^Opening$/i.test(clean(val(r7,start))))throw Error(c.v+'의 기초·입고·판매·월말 열 구성이 변경되었습니다.');
    const saleCols=cols(sales,colName(colNo(close)-1));
    if(saleCols.length!==2)throw Error(c.v+'의 Event·Normal 판매계획 열을 확인하세요.');
    return {key:`${year}-${String(month).padStart(2,'0')}`,label:`${year}.${String(month).padStart(2,'0')}`,short:`${String(year).slice(-2)}.${String(month).padStart(2,'0')}`,start,close,incoming,sales,saleCols,inCols:cols(incoming,colName(colNo(sales)-1))};
  });
}
function parseModel(data){
  const rows=data.sheets['CMMF_Tefal'];
  if(!rows)throw Error('CMMF_Tefal 시트가 없습니다.');
  for(const [c,label] of [['A','CMMF'],['B','Item'],['V','General Status'],['W','Company Status']]){
    if(clean(val(rows['8'],c)).toLowerCase()!==label.toLowerCase())throw Error('필수 열 '+c+' ('+label+')의 위치가 변경되었습니다.');
  }
  const months=getMonths(rows),pairs=[],issues=[],seen=new Set();
  const phase=data.sheets['Phase In & Out'];
  if(!phase)issues.push('Phase In & Out 시트가 없어 신·구제품 연결 정보를 표시할 수 없습니다.');
  if(phase && (text(phase['4'],'A')!=='CMMF'||text(phase['4'],'F')!=='CMMF'))throw Error('Phase In & Out 헤더 구조가 변경되었습니다.');
  for(const [rn,row] of Object.entries(phase??{})){
    if(Number(rn)<5)continue;
    const a=id(val(row,'A')),b=id(val(row,'F'));
    if(validId(a)||validId(b))pairs.push({row:Number(rn),newId:validId(a)?a:null,oldId:validId(b)?b:null,newName:text(row,'B'),oldName:text(row,'G'),remark:text(row,'E'),confirm:val(row,'J'),comment:text(row,'K'),incremental:/incremental/i.test(b)});
  }
  const products=[];
  for(const [rn,row] of Object.entries(rows)){
    if(Number(rn)<9)continue;
    const sku=id(val(row,'A'));if(!validId(sku)||!text(row,'B'))continue;
    if(seen.has(sku))throw Error('중복 SKU '+sku+'를 발견했습니다. 합계 중복을 막기 위해 불러오기를 중단합니다.');
    seen.add(sku);
    const local=text(row,'W'),global=text(row,'V'),lc=code(local),gc=code(global),status=lc??gc;
    let stage=status===40?'new':[60,65,70,80].includes(status)?'out':[15,20,25].includes(status)?'prepare':status===50?'active':'unknown';
    if(/^TBD/i.test(sku)&&stage!=='out')stage='prepare';
    if(/cancel/i.test(text(row,'X')))stage='canceled';
    const monthly=months.map(m=>{
      const opening=numeric(row,m.start),incoming=sumCells(row,m.inCols),event=numeric(row,m.saleCols[0],true),normal=numeric(row,m.saleCols[1],true),closing=numeric(row,m.close);
      const demand=event==null||normal==null?null:event+normal;
      const derived=opening==null||incoming==null||demand==null?null:opening+incoming-demand;
      return {opening,incoming,event,normal,demand,closing,mismatch:derived!=null&&closing!=null&&Math.abs(derived-closing)>0.01,missing:[opening,incoming,event,normal,closing].some(v=>v==null),source:`${m.start}${rn}:${m.close}${rn}`};
    });
    products.push({sku,name:text(row,'B'),channel:text(row,'C')||'미입력',category:text(row,'N')||'미입력',family:text(row,'Q')||'미입력',reportQty:numeric(row,'D'),general:global,company:local,status,stage,fallback:lc==null&&gc!=null,conflict:lc!=null&&gc!=null&&lc!==gc,wh:numeric(row,'CZ'),bonded:numeric(row,'DA'),row:Number(rn),monthly,pairs:pairs.filter(p=>p.newId===sku||p.oldId===sku)});
  }
  if(!products.length)throw Error('유효한 제품 행을 찾을 수 없습니다.');
  const missing=products.filter(p=>p.monthly.some(m=>m.missing)),mismatch=products.filter(p=>p.monthly.some(m=>m.mismatch)),conflicts=products.filter(p=>p.conflict),fallback=products.filter(p=>p.fallback),unknown=products.filter(p=>p.stage==='unknown'),garbled=products.filter(p=>[p.name,p.general,p.channel].some(x=>x.includes('�'))),reportQty=products.filter(p=>p.reportQty!==1);
  if(missing.length)issues.push(`기초·월말재고 또는 수식 결과 확인 필요: ${missing.length} SKU. 영향을 받는 월은 값 확인 대상으로 표시합니다.`);
  if(mismatch.length)issues.push(`월말재고와 기초 + 입고 − 판매가 일치하지 않는 제품: ${mismatch.length} SKU. 원본 결과를 유지하며 상세에서 차이를 표시합니다.`);
  if(conflicts.length)issues.push(`Company / General 상태 코드가 다른 제품: ${conflicts.length} SKU. Company Status 우선 적용.`);
  if(fallback.length)issues.push(`Company Status 코드가 없어 General Status를 사용한 제품: ${fallback.length} SKU.`);
  if(unknown.length)issues.push(`제품 상태 코드 미확인: ${unknown.length} SKU. '상태 확인' 대상에 포함합니다.`);
  if(garbled.length)issues.push(`원본에 깨진 문자(�)가 포함된 제품: ${garbled.length} SKU. 원문을 그대로 표시합니다.`);
  if(reportQty.length)issues.push(`Reporting Q’TY가 1이 아니거나 미입력인 제품: ${reportQty.length} SKU. 원본 수량의 합계이므로 단위 확인이 필요합니다.`);
  const dateIssue=Object.entries(rows['3']??{}).some(([,c])=>typeof c.v==='number'&&c.v>0&&c.v<100);
  if(dateIssue)issues.push('일부 상단 주차별 날짜에 1900년으로 표시되는 값이 있어, 이 리포트는 6행의 월별 Q’ty 헤더를 사용합니다. 주차별 날짜로 입고일을 계산하지 않습니다.');
  const stockBasis=text(rows['7'],'CZ'),actualBasis=text(rows['8'],'DB');
  const wm=data.filename.match(/W(\d{2})(\d{2})(?!\d)/i);
  const last=months.at(-1).key;
  return {filename:data.filename,months,products,issues,week:wm?`20${wm[2]} · W${wm[1]}`:'주차 미확인',stockBasis,actualBasis,old:last<new Date().toISOString().slice(0,7),stats:{missing:missing.length,mismatch:mismatch.length,conflicts:conflicts.length,garbled:garbled.length}};
}

function option(value,label){return `<option value="${esc(value)}">${esc(label)}</option>`;}
function compact(data){
  const rows=data.sheets['CMMF_Tefal'],allowed=new Set(['A','B','C','D','N','Q','V','W','X','CZ','DA']);
  for(const m of getMonths(rows))for(const c of cols(m.start,m.close))allowed.add(c);
  const kept={};for(const [rn,r]of Object.entries(rows))if(Number(rn)<9)kept[rn]=r;else if(validId(val(r,'A'))&&text(r,'B'))kept[rn]=Object.fromEntries(Object.entries(r).filter(([k])=>allowed.has(k)));
  return {...data,sheets:{...data.sheets,CMMF_Tefal:kept}};
}
function showMessage(msg,error=false){$('message').hidden=false;$('message').textContent=msg;$('message').className=error?'error':'';}
function load(data,announce=false){
  const next=parseModel(data);raw=compact(data);model=next;
  $('report-data').textContent=JSON.stringify(raw).replace(/</g,'\\u003c');
  $('sourceName').textContent=model.filename;
  $('week').textContent=model.week+(model.old?' · 과거 계획':'');
  $('basis').textContent=`재고: ${model.stockBasis||'기준일 미표시'} / ${model.actualBasis||'실적 기준일 미표시'}`;
  $('start').innerHTML=model.months.map((m,i)=>option(i,m.label)).join('');
  $('end').innerHTML=$('start').innerHTML;$('end').value=String(Math.min(2,model.months.length-1));
  for(const [el,prop,label] of [['category','category','전체 카테고리'],['fl1','family','전체 FL1']])$(''+el).innerHTML=option('',label)+[...new Set(model.products.map(p=>p[prop]))].sort().map(x=>option(x,x)).join('');
  $('search').value='';$('qualityCount').textContent=`확인 사항 ${model.issues.length}개`;
  $('quality').innerHTML='<strong>원본 데이터 확인 사항</strong><ul>'+model.issues.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
  $('recordCount').textContent=`${fmt(model.products.length)} SKU · ${model.months.length}개월`;
  pages={shortage:1,new:1,eol:1};render();
  if(announce)showMessage(`불러오기 완료: ${model.filename} · ${model.products.length} SKU. 갱신본을 공유하려면 'HTML 저장'을 누르세요.`);
}
function range(){return model.months.map((m,i)=>i).filter(i=>i>=Number($('start').value)&&i<=Number($('end').value));}
function filtered(){const q=$('search').value.toLowerCase().trim();return model.products.filter(p=>(!$('category').value||p.category===$('category').value)&&(!$('fl1').value||p.family===$('fl1').value)&&(!q||[p.name,p.sku,p.channel,p.family].join(' ').toLowerCase().includes(q)));}
function metrics(p,indices){
  const ms=indices.map(i=>p.monthly[i]),neg=indices.filter(i=>p.monthly[i].closing!=null&&p.monthly[i].closing<0),first=neg[0];
  const peak=Math.max(0,...ms.map(m=>m.closing==null?0:-m.closing)),missing=ms.some(m=>m.missing||m.mismatch);
  const incoming=ms.every(m=>m.incoming!=null)?ms.reduce((s,m)=>s+m.incoming,0):null;
  const demand=ms.every(m=>m.demand!=null)?ms.reduce((s,m)=>s+m.demand,0):null;
  return {neg,first,peak,missing,incoming,demand,end:ms.at(-1)?.closing??null};
}
function lifeAction(p,x){
  if(x.missing)return ['원본 수량·수식 확인','warn'];
  if(p.stage==='canceled')return ['취소 여부·잔여 계획 확인','warn'];
  if(p.stage==='unknown')return ['제품 상태 확인','warn'];
  if(p.stage==='active'&&p.conflict)return ['제품 단계 차이 확인','warn'];
  if(x.peak>0)return [p.stage==='out'?'잔여 판매·대체 전환 협의':'입고·판매계획 협의','risk'];
  if(p.stage==='out'&&x.incoming>0)return ['EOL 입고계획 확인','warn'];
  if(p.stage==='out'&&x.end>0)return ['잔여재고 소진계획 수립','warn'];
  if(['new','prepare'].includes(p.stage)&&x.demand>0&&x.incoming===0&&p.monthly[range()[0]].opening<=0)return ['출시 물량 확보 확인','warn'];
  if(['new','prepare'].includes(p.stage)&&x.demand===0)return ['출시 시점·수요계획 확인','neutral'];
  if(p.stage==='out')return ['전환·종료 상태 확인','neutral'];
  return ['월말 계획상 부족 없음','neutral'];
}
function badge(label,type=''){return `<span class="badge ${type}">${esc(label)}</span>`;}
function num(v,negative=false){return v==null?'<span class="amber">값 확인</span>':`<span class="${v<0?'red':v===0?'num-zero':''}">${fmt(v)}</span>`;}
function product(p){return `<button class="product-button" data-sku="${esc(p.sku)}">${esc(p.name)}</button><span class="sku">${esc(p.sku)} · ${esc(p.family||p.category)}</span>`;}
// Reader-facing report views. Incorporated into app.js by revise_report.py.
function shortageValue(m){return m.closing==null?null:Math.max(0,-m.closing);}
function shortageCell(m){
  const q=shortageValue(m);
  return `<td class="${q>0?'num-neg':''}" title="원본 ${esc(m.source)}${m.missing||m.mismatch?' · 값 확인 필요':''}">${q==null?'<span class="amber">값 확인</span>':q>0?fmt(q):'<span class="num-zero">—</span>'}${m.missing||m.mismatch?'<span class="smalltext amber">값 확인</span>':''}</td>`;
}
function updateFl1(){
  const chosen=$('fl1').value;
  const ps=model.products.filter(p=>!$('category').value||p.category===$('category').value);
  const families=[...new Set(ps.map(p=>p.family))].sort();
  $('fl1').innerHTML=option('','전체 FL1')+families.map(f=>option(f,f)).join('');
  $('fl1').value=families.includes(chosen)?chosen:'';
}
function setTab(next){
  tab=['shortage','new','eol'].includes(next)?next:'shortage';
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-pressed',String(b.dataset.tab===tab));});
  for(const name of ['shortage','new','eol'])$(name+'View').hidden=tab!==name;
}
function launchMonth(p){const i=p.monthly.findIndex(m=>m.demand>0);return i<0?null:model.months[i].label;}
function endShortage(ps,index){return ps.reduce((s,p)=>s+(shortageValue(p.monthly[index])??0),0);}
function categoryShortages(ps,index){
  const groups=new Map();
  for(const p of ps){const q=shortageValue(p.monthly[index]);if(q>0)groups.set(p.category,(groups.get(p.category)||0)+q);}
  return [...groups].map(([category,quantity])=>({category,quantity})).sort((a,b)=>b.quantity-a.quantity);
}
function render(){
  const ps=filtered(),idx=range(),last=idx.at(-1),xs=ps.map(p=>({p,x:metrics(p,idx)}));
  const risks=xs.filter(r=>r.x.peak>0),newRows=xs.filter(r=>['new','prepare','canceled','unknown'].includes(r.p.stage)),eolRows=xs.filter(r=>r.p.stage==='out');
  const newRisk=newRows.filter(r=>['new','prepare'].includes(r.p.stage)&&r.x.peak>0).length;
  const outStock=eolRows.filter(r=>r.x.end>0).length,uncertain=xs.filter(r=>r.x.missing).length;
  const missingLast=ps.filter(p=>p.monthly[last].closing==null).length;
  const kpis=[['부족 예상 제품',fmt(risks.length),'SKU',`${fmt(ps.length)}개 제품 중 · 선택 기간 내 중복 제거`,'red'],[`${model.months[last].label} 부족수량`,fmt(endShortage(ps,last)),'수량',missingLast?`월말 부족 잔량 합계 · ${missingLast} SKU 값 미확인`:'선택 종료월의 부족 잔량 합계 · 원본 Q’ty','red'],['신제품·출시 준비 부족',fmt(newRisk),'SKU','선택 기간 중 월말재고가 음수인 제품',''],['EOL 잔여재고',fmt(outStock),'SKU','선택 종료월 예상재고가 양수인 제품','']];
  $('kpis').innerHTML=kpis.map(([label,v,u,sub,c])=>`<div class="kpi"><div class="label">${label}</div><div class="value ${c}">${v}<small>${u}</small></div><div class="sub">${sub}</div></div>`).join('');
  $('shortageCount').textContent=fmt(risks.length);$('newCount').textContent=fmt(newRows.length);$('eolCount').textContent=fmt(eolRows.length);
  const groups=categoryShortages(ps,last),max=Math.max(1,...groups.map(g=>g.quantity));
  $('chartMonth').textContent=model.months[last].label+' 기준';
  $('chart').innerHTML=groups.length?groups.map(g=>`<div class="category-bar-row"><span class="category-bar-label" title="${esc(g.category)}">${esc(g.category)}</span><div class="category-bar-track"><div class="category-bar-fill" style="width:${g.quantity/max*100}%"></div></div><strong>${fmt(g.quantity)}</strong></div>`).join(''):'<p class="empty">선택 종료월에는 부족이 예상되는 제품이 없습니다.</p>';
  $('priority').innerHTML=[[newRisk,'신제품·출시 준비 물량 확인','출시 계획과 입고계획을 함께 점검하세요.'],[eolRows.filter(r=>r.x.incoming>0).length,'EOL 제품에 입고계획 존재','잔여 판매와 추가 입고 필요성을 확인하세요.'],[uncertain,'원본 값 확인 필요','계산 누락·수량 불일치 대상입니다.']].map(([n,t,d])=>`<div class="priority-item"><span class="priority-number">${fmt(n)}</span><div><strong>${t}</strong><p>${d}</p></div></div>`).join('');
  const order=(a,b)=>Number(b.x.missing)-Number(a.x.missing)||b.x.peak-a.x.peak||a.p.sku.localeCompare(b.p.sku);
  shownShort=xs.filter(r=>$('shortageMode').value==='all'||r.x.peak>0||r.x.missing).sort(order);
  const nm=$('newMode').value,em=$('eolMode').value;
  shownNew=newRows.filter(r=>nm==='all'||(nm==='conflict'?r.p.conflict:r.p.stage===nm)).sort(order);
  shownEol=eolRows.filter(r=>em==='all'||(em==='incoming'?r.x.incoming>0:em==='stock'?r.x.end>0:em==='shortage'?r.x.peak>0:r.p.conflict)).sort(order);
  $('newSummary').innerHTML=summaryCards([['신제품',newRows.filter(r=>r.p.stage==='new').length,'Company Status 40 기준'],['출시 준비',newRows.filter(r=>r.p.stage==='prepare').length,'임시 SKU 포함 · 취소 제품 제외'],['신제품·출시 준비 부족',newRisk,'선택 기간 중 공급 확인 필요']]);
  $('eolSummary').innerHTML=summaryCards([['EOL 제품',eolRows.length,'Company Status 60·65·70·80 기준'],['기간 내 입고계획',eolRows.filter(r=>r.x.incoming>0).length,'추가 입고 필요성 확인'],['종료월 잔여재고',outStock,'잔여재고 소진계획 확인']]);
  $('newExtra').textContent=`추가 점검: 취소 표시 ${newRows.filter(r=>r.p.stage==='canceled').length} SKU · 상태 코드 차이 ${newRows.filter(r=>r.p.conflict).length} SKU. 취소 표시는 출시 준비와 구분합니다.`;
  $('eolExtra').textContent=`상태 코드 차이 ${eolRows.filter(r=>r.p.conflict).length} SKU. Company Status를 우선 적용하며, 상세에서 General Status와 비교할 수 있습니다.`;
  renderShort(idx);renderNew(idx);renderEol(idx);
}
function summaryCards(cards){return cards.map(([t,n,s])=>`<div class="life-card"><span>${t}</span><b>${fmt(n)}</b><p>${s}</p></div>`).join('');}
function pager(key,total){
  const n=Math.max(1,Math.ceil(total/PAGE));pages[key]=Math.min(pages[key],n);
  return `<span>${fmt(total)}개 제품 · ${total?fmt((pages[key]-1)*PAGE+1):0}–${fmt(Math.min(pages[key]*PAGE,total))} 표시</span><div class="pagination"><button data-page="${key}" data-delta="-1" ${pages[key]===1?'disabled':''}>이전</button><span>${pages[key]} / ${n}</span><button data-page="${key}" data-delta="1" ${pages[key]===n?'disabled':''}>다음</button></div>`;
}
function visibleRows(rows,key,all){return all?rows:rows.slice((pages[key]-1)*PAGE,pages[key]*PAGE);}
function action(p,x){return x.missing?badge('원본 수량·수식 확인','warn'):badge(x.peak>0?(p.stage==='out'?'잔여 판매·대체 전환 협의':'입고·판매계획 협의'):'월말 계획상 부족 없음',x.peak>0?'risk':'neutral');}
function renderShort(idx,all=false){
  $('shortageFooter').innerHTML=pager('shortage',shownShort.length);
  const list=visibleRows(shownShort,'shortage',all);
  $('shortageTable').innerHTML=`<table><thead><tr><th>제품 / SKU</th><th>대상 채널</th><th>단계</th>${idx.map(i=>`<th>${model.months[i].label}</th>`).join('')}<th>확인할 조치</th></tr></thead><tbody>${list.length?list.map(({p,x})=>`<tr><td class="product-cell">${product(p)}</td><td class="wrap">${esc(p.channel)}</td><td>${badge(stageName[p.stage],p.stage==='out'?'warn':'')}</td>${idx.map(i=>shortageCell(p.monthly[i])).join('')}<td class="action-cell">${action(p,x)}</td></tr>`).join(''):`<tr><td colspan="${4+idx.length}" class="empty">선택한 조건에 해당하는 제품이 없습니다.</td></tr>`}</tbody></table>`;
}
function statusCell(p){return `${badge(stageName[p.stage],p.stage==='out'?'warn':'')}<span class="smalltext">${p.status??'미입력'}${p.conflict?' · 상태 차이':''}${p.fallback?' · General 적용':''}</span>`;}
function linkCell(p){const count=p.pairs.filter(pair=>pair.newId&&pair.oldId).length;return count?badge(count+'건 연결'):'—';}
function renderNew(idx,all=false){
  $('newFooter').innerHTML=pager('new',shownNew.length);
  const list=visibleRows(shownNew,'new',all);
  $('newTable').innerHTML=`<table><thead><tr><th>제품 / SKU</th><th>대상 채널</th><th>단계 / 상태</th><th>출시 월¹</th><th>기간 입고</th><th>${model.months[idx.at(-1)].label} 잔량</th><th>신·구제품 연결</th><th>확인할 조치</th></tr></thead><tbody>${list.length?list.map(({p,x})=>{const a=lifeAction(p,x);return `<tr><td class="product-cell">${product(p)}</td><td class="wrap">${esc(p.channel)}</td><td>${statusCell(p)}</td><td title="원본 전체 계획 기간의 최초 수요 월로 추정">${launchMonth(p)??'미확인'}</td><td>${num(x.incoming)}</td><td class="${x.end<0?'num-neg':''}">${num(x.end)}</td><td>${linkCell(p)}</td><td class="action-cell">${badge(a[0],a[1])}</td></tr>`;}).join(''):'<tr><td colspan="8" class="empty">선택한 조건에 해당하는 제품이 없습니다.</td></tr>'}</tbody></table>`;
}
function renderEol(idx,all=false){
  $('eolFooter').innerHTML=pager('eol',shownEol.length);
  const list=visibleRows(shownEol,'eol',all);
  $('eolTable').innerHTML=`<table><thead><tr><th>제품 / SKU</th><th>대상 채널</th><th>EOL 상태</th><th>기간 입고</th><th>${model.months[idx.at(-1)].label} 잔량</th><th>신·구제품 연결</th><th>확인할 조치</th></tr></thead><tbody>${list.length?list.map(({p,x})=>{const a=lifeAction(p,x);return `<tr><td class="product-cell">${product(p)}</td><td class="wrap">${esc(p.channel)}</td><td>${statusCell(p)}</td><td>${num(x.incoming)}</td><td class="${x.end<0?'num-neg':''}">${num(x.end)}</td><td>${linkCell(p)}</td><td class="action-cell">${badge(a[0],a[1])}</td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">선택한 조건에 해당하는 제품이 없습니다.</td></tr>'}</tbody></table>`;
}
function captureState(){return {tab,values:Object.fromEntries(['start','end','category','fl1','search','shortageMode','newMode','eolMode'].map(k=>[k,$(k).value]))};}
function restoreState(s){
  const values=s.values??{};
  for(const k of ['category','start','end','search','shortageMode','newMode','eolMode'])if(k in values){const el=$(k),v=String(values[k]);if(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===v))el.value=v;}
  updateFl1();if([...$('fl1').options].some(o=>o.value===String(values.fl1)))$('fl1').value=String(values.fl1);
  if(Number($('start').value)>Number($('end').value))$('end').value=$('start').value;
  setTab(s.tab==='lifecycle'?'new':s.tab);render();
}
function excelDate(v){if(v==null||v==='')return '미입력';if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);return String(v);}
function detail(sku){
  const p=model.products.find(p=>p.sku===sku);if(!p)return;const x=metrics(p,range()),a=lifeAction(p,x);
  $('detailBody').innerHTML=`<h2>${esc(p.name)}</h2><div class="dialog-meta"><span>${esc(p.sku)}</span><span>${esc(p.category)} / FL1 ${esc(p.family)}</span><span>${esc(p.channel)}</span></div>${badge(stageName[p.stage])}<div class="dialog-grid"><div><h3>제품 상태</h3><p>Company: ${esc(p.company||'미입력')}</p><p>General: ${esc(p.general||'미입력')}</p><p>${p.conflict?'두 상태 코드가 다릅니다. Company Status를 우선 적용했습니다.':p.fallback?'Company 코드가 없어 General Status를 적용했습니다.':'원본 상태 기준으로 분류했습니다.'}</p></div><div><h3>재고 및 권고</h3><p>창고재고 ${fmt(p.wh)} / 보세·부산 ${fmt(p.bonded)}</p><p>선택 종료월 잔량 ${fmt(x.end)}</p><p>${esc(a[0])}</p><p>Reporting Q’TY: ${fmt(p.reportQty)} · 환산 미적용</p></div></div><div class="dialog-table"><table><thead><tr><th>월</th><th>기초</th><th>입고</th><th>행사 판매</th><th>일반 판매</th><th>월말</th><th>부족수량</th><th>원본 위치</th></tr></thead><tbody>${model.months.map((m,i)=>{const v=p.monthly[i];return `<tr><td>${m.label}</td><td>${num(v.opening)}</td><td>${num(v.incoming)}</td><td>${num(v.event)}</td><td>${num(v.normal)}</td><td>${num(v.closing)}</td>${shortageCell(v)}<td>${esc(v.source)}</td></tr>`;}).join('')}</tbody></table></div><p class="source-ref">출처: CMMF_Tefal!A${p.row}:W${p.row} / 재고 CZ${p.row}:DA${p.row}. 값은 원본에 저장된 계산 결과입니다.</p><h3>신·구제품 연결 및 원본 메모</h3>${p.pairs.length?p.pairs.map(pair=>`<div class="pair-row"><strong>신제품 ${esc(pair.newId||'미입력')} / 구제품 ${esc(pair.oldId||(pair.incremental?'incremental (구제품 없음)':'미입력'))}</strong><p>${esc(pair.newName)} / ${esc(pair.oldName)}</p><p>확인일 ${esc(excelDate(pair.confirm))} · ${esc(pair.remark||'')} ${esc(pair.comment||'')}</p><span class="smalltext">Phase In &amp; Out!A${pair.row}:K${pair.row} · 이 연결만으로 신제품·EOL 상태를 확정하지 않습니다.</span></div>`).join(''):'<p class="muted">전환표에서 연결된 행을 찾지 못했습니다. 대체제품 관계를 확인하세요.</p>'}<p class="dialog-note">계획상 부족은 실제 품절일을 의미하지 않습니다. 출시 월은 원본 전체 계획에서 처음 수요가 잡힌 월을 사용한 추정치이며, 신·구 SKU 연결과 확인일은 출시일·EOL일·대체품 승인을 보장하지 않습니다.</p>`;
  $('detail').showModal();
}
function csvContent(kind){
  const idx=range(),base=['SKU','제품명','카테고리','FL1','대상 채널','단계'];
  const headers=kind==='shortage'?[...base,...idx.map(i=>model.months[i].label+' 부족수량'),'권고 조치','원본 행']:kind==='new'?[...base,'출시 월(최초 수요 월 기준 추정)','기간 입고','종료월 잔량','권고 조치','원본 행']:[...base,'기간 입고','종료월 잔량','Company Status','General Status','권고 조치','원본 행'];
  const rows=(kind==='shortage'?shownShort:kind==='new'?shownNew:shownEol).map(({p,x})=>{
    const b=[p.sku,p.name,p.category,p.family,p.channel,stageName[p.stage]];
    return kind==='shortage'?[...b,...idx.map(i=>shortageValue(p.monthly[i])??'값 확인'),x.missing?'원본 수량·수식 확인':x.peak>0?'입고·판매계획 협의':'월말 계획상 부족 없음',p.row]:kind==='new'?[...b,launchMonth(p)??'미확인',x.incoming??'값 확인',x.end??'값 확인',lifeAction(p,x)[0],p.row]:[...b,x.incoming??'값 확인',x.end??'값 확인',p.company,p.general,lifeAction(p,x)[0],p.row];
  });
  return '\uFEFF'+[headers,...rows].map(r=>r.map(v=>{let s=String(v??'');if(typeof v==='string'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');
}
function exportCsv(kind){const idx=range();download(new Blob([csvContent(kind)],{type:'text/csv;charset=utf-8'}),`${kind}_${model.months[idx[0]].key}_${model.months[idx.at(-1)].key}.csv`);}

function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

// Standard ZIP / OOXML reader. Workbooks and macros never leave this browser.
async function readWorkbook(file){
  const buf=await file.arrayBuffer(),view=new DataView(buf),bytes=new Uint8Array(buf);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('ZIP 기반의 .xlsx / .xlsm 파일을 선택하세요. 암호화된 파일은 지원하지 않습니다.');
  const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),entries=new Map();
  for(let i=0;i<count;i++){
    if(view.getUint32(pos,true)!==0x02014b50)throw Error('엑셀 ZIP 구조가 손상되었습니다.');
    const flag=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true),nl=view.getUint16(pos+28,true),xl=view.getUint16(pos+30,true),cl=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
    const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nl));entries.set(name,{flag,method,size,uncompressed,offset});pos+=46+nl+xl+cl;
  }
  async function xml(name,optional=false){
    const e=entries.get(name);if(!e){if(optional)return null;throw Error(name+'를 찾을 수 없습니다.');}
    if(e.flag&1)throw Error('암호화된 엑셀 파일은 지원하지 않습니다.');
    if(e.uncompressed>100*1024*1024)throw Error('시트가 너무 큽니다. 100MB 이하의 XML 시트를 지원합니다.');
    const off=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true),compressed=bytes.subarray(off,off+e.size);
    let output;
    if(e.method===0)output=compressed;
    else if(e.method===8){if(typeof DecompressionStream==='undefined')throw Error('이 브라우저는 엑셀 압축 해제를 지원하지 않습니다. 최신 Chrome 또는 Edge로 여세요.');output=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
    else throw Error('지원하지 않는 ZIP 압축 방식입니다.');
    const doc=new DOMParser().parseFromString(new TextDecoder().decode(output),'application/xml');if(doc.querySelector('parsererror'))throw Error(name+' XML을 읽을 수 없습니다.');return doc;
  }
  const [wb,rels,shared]=await Promise.all([xml('xl/workbook.xml'),xml('xl/_rels/workbook.xml.rels'),xml('xl/sharedStrings.xml',true)]);
  const strings=shared?Array.from(shared.getElementsByTagName('si'),si=>Array.from(si.getElementsByTagName('t'),t=>t.textContent).join('')):[];
  const targets=new Map(Array.from(rels.getElementsByTagName('Relationship'),r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const sheets={};
  for(const s of wb.getElementsByTagName('sheet')){
    const name=s.getAttribute('name');if(!['CMMF_Tefal','Phase In & Out'].includes(name))continue;
    const target=targets.get(s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
    if(!target)throw Error(name+' 시트 경로를 찾을 수 없습니다.');
    const path=target.startsWith('/')?target.slice(1):'xl/'+target,doc=await xml(path),rows={};
    for(const row of doc.getElementsByTagName('row')){
      const cells={};for(const c of row.getElementsByTagName('c')){
        const col=c.getAttribute('r').replace(/\d/g,''),typ=c.getAttribute('t')||'n',vv=c.getElementsByTagName('v')[0],hasFormula=c.getElementsByTagName('f').length>0;
        let v=vv?vv.textContent:null;
        if(typ==='s'&&v!=null)v=strings[Number(v)];else if(typ==='inlineStr')v=Array.from(c.getElementsByTagName('t'),t=>t.textContent).join('');else if((typ==='n'||typ==='b')&&v!=null&&v!=='')v=Number(v);
        if(v!=null||hasFormula)cells[col]={v,f:hasFormula,t:typ};
      }rows[row.getAttribute('r')]=cells;
    }sheets[name]=rows;
  }
  return {filename:file.name,generatedAt:new Date().toISOString(),sheets};
}

// Browser interaction handlers. Incorporated into app.js by revise_report.py.
for(const el of ['start','end','category','fl1','shortageMode','newMode','eolMode'])$(el).addEventListener('change',()=>{
  if(Number($('start').value)>Number($('end').value)){if(el==='start')$('end').value=$('start').value;else $('start').value=$('end').value;}
  if(el==='category')updateFl1();pages={shortage:1,new:1,eol:1};render();
});
$('search').addEventListener('input',()=>{pages={shortage:1,new:1,eol:1};render();});
$('reset').addEventListener('click',()=>{$('category').value='';updateFl1();$('fl1').value='';$('search').value='';$('start').value='0';$('end').value=String(Math.min(2,model.months.length-1));$('shortageMode').value='risk';$('newMode').value='all';$('eolMode').value='all';pages={shortage:1,new:1,eol:1};render();});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab]');if(t)setTab(t.dataset.tab);
  const p=e.target.closest('[data-page]');if(p){pages[p.dataset.page]+=Number(p.dataset.delta);render();}
  const s=e.target.closest('[data-sku]');if(s)detail(s.dataset.sku);
});
$('closeDetail').onclick=()=>$('detail').close();
$('detail').addEventListener('click',e=>{if(e.target===$('detail')){const r=$('detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('detail').close();}});
$('methodButton').onclick=()=>{$('method').open=true;$('method').scrollIntoView({behavior:'smooth'});};
$('csvShortage').onclick=()=>exportCsv('shortage');$('csvNew').onclick=()=>exportCsv('new');$('csvEol').onclick=()=>exportCsv('eol');
$('file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!/\.(xlsx|xlsm)$/i.test(file.name)){showMessage('.xlsx 또는 .xlsm 파일을 선택하세요.',true);return;}
  showMessage('엑셀을 읽고 있습니다. 파일 크기에 따라 잠시 걸릴 수 있습니다.');$('file').disabled=true;
  try{const next=await readWorkbook(file);parseModel(next);load(next,true);}catch(error){showMessage('새 파일을 반영하지 못했습니다. 기존 리포트를 유지합니다. '+error.message,true);}finally{$('file').disabled=false;e.target.value='';}
});
$('save').onclick=()=>{
  const clone=document.documentElement.cloneNode(true);clone.querySelector('#detail').removeAttribute('open');clone.querySelector('#message').hidden=true;
  clone.querySelector('#report-state').textContent=JSON.stringify(captureState()).replace(/</g,'\\u003c');
  download(new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'}),`Commercial_Supply_${model.filename.replace(/\.[^.]+$/,'')}.html`);
};
$('print').onclick=()=>window.print();
window.addEventListener('beforeprint',()=>{renderShort(range(),true);renderNew(range(),true);renderEol(range(),true);});
window.addEventListener('afterprint',()=>render());
try{load(JSON.parse($('report-data').textContent));restoreState(JSON.parse($('report-state').textContent));}catch(error){showMessage('리포트를 초기화하지 못했습니다. '+error.message,true);}
