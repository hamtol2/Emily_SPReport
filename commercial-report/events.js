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
