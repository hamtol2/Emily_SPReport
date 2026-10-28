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
