/* Official CBU API. No API key, proxy, simulated prices or embedded stale rates. */
(()=>{
  'use strict';
  const API='https://cbu.uz/ru/arkhiv-kursov-valyut/json/';
  const CURRENCIES=['USD','EUR','RUB','CNY'];
  const CACHE_KEY='fsg.cbu.rates.v1';
  const REFRESH_MS=5*60*1000;
  const status=document.getElementById('fx-status');
  const button=document.getElementById('fx-refresh');
  const formatter=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
  let lastSuccess=0,loading=false,current=null;
  function dateValue(value){
    if(typeof value!=='string'||!/^\d{2}\.\d{2}\.\d{4}$/.test(value))return NaN;
    const [day,month,year]=value.split('.').map(Number);
    const result=Date.UTC(year,month-1,day);
    const d=new Date(result);
    return d.getUTCDate()===day&&d.getUTCMonth()===month-1&&d.getUTCFullYear()===year?result:NaN;
  }
  function parse(data){
    if(!Array.isArray(data))throw new Error('Invalid API response');
    return CURRENCIES.map(code=>{
      const candidates=data.filter(r=>r&&r.Ccy===code&&Number.isFinite(dateValue(r.Date))).sort((a,b)=>dateValue(b.Date)-dateValue(a.Date));
      const row=candidates[0];
      const rate=Number(row?.Rate),nominal=Number(row?.Nominal);
      if(!row||!Number.isFinite(rate)||rate<=0||!Number.isFinite(nominal)||nominal<=0)throw new Error('Missing currency');
      return {code,rate:rate/nominal,date:row.Date};
    });
  }
  function render(snapshot,cached=false){
    for(const r of snapshot.rates){
      const node=document.querySelector(`[data-currency="${r.code}"]`);
      node.textContent=formatter.format(r.rate);
      node.parentElement.title=`1 ${r.code} = ${formatter.format(r.rate)} UZS. Курс ЦБ на ${r.date}`;
    }
    const dates=[...new Set(snapshot.rates.map(r=>r.date))];
    const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tashkent'}).format(snapshot.checkedAt);
    status.textContent=`${cached?'Кэш · ':''}от ${dates.join(' / ')}`;
    status.title=`Курсы в UZS за 1 единицу валюты. ${cached?'Последняя успешная проверка':'Проверено'}: ${new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeZone:'Asia/Tashkent'}).format(snapshot.checkedAt)}, ${time} (Ташкент). Автопроверка каждые 5 минут.`;
    document.querySelector('.fx-bar').classList.toggle('fx-cached',cached);
  }
  try{
    const saved=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(saved&&Array.isArray(saved.rates)&&saved.rates.length===4&&CURRENCIES.every(c=>saved.rates.some(r=>r.code===c&&Number.isFinite(r.rate)&&r.rate>0&&Number.isFinite(dateValue(r.date))))&&Number.isFinite(saved.checkedAt)&&saved.checkedAt<=Date.now()){
      current=saved;render(current,true);
    }
  }catch{/* Storage may be unavailable for local files or private browsing. */}
  async function refresh(){
    if(loading)return;
    loading=true;button.disabled=true;button.setAttribute('aria-busy','true');
    if(!current)status.textContent='Загрузка курсов…';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(API,{signal:controller.signal,mode:'cors',credentials:'omit',cache:'no-store'});
      if(!response.ok)throw new Error(`CBU ${response.status}`);
      const rates=parse(await response.json());
      current={rates,checkedAt:Date.now()};lastSuccess=Date.now();render(current);
      try{localStorage.setItem(CACHE_KEY,JSON.stringify(current))}catch{}
    }catch{
      if(current){render(current,true);status.title+=' Сейчас API недоступен; отображаются сохраненные курсы.'}
      else{status.textContent='ЦБ временно недоступен';status.title='Проверьте подключение и нажмите «Обновить курсы валют». Автоматическая проверка повторится через 5 минут.'}
    }finally{clearTimeout(timeout);loading=false;button.disabled=false;button.removeAttribute('aria-busy')}
  }
  button.addEventListener('click',refresh);
  setInterval(()=>{if(!document.hidden)refresh()},REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastSuccess>=REFRESH_MS)refresh()});
  window.addEventListener('online',refresh);
  refresh();
})();
