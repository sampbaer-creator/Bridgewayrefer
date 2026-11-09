'use strict';
(() => {
  const monthSelect = document.querySelector('#report-month');
  if (!monthSelect) return;
  const ns = 'http://www.w3.org/2000/svg';
  let report, view = 'bars', chosenMonth = '', requestId = 0;
  function el(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function svgEl(tag, attrs = {}, text) {
    const item = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key,value]) => item.setAttribute(key,String(value)));
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function summary() {
    const total = el('div',undefined,'summary-card summary-primary');
    total.append(el('p','Total referrals'),el('strong',String(report.total)),el('small',report.monthLabel+(report.isCurrentMonth?' · month to date':'')));
    const offices = el('div',undefined,'summary-card');
    offices.append(el('p','Referring offices'),el('strong',String(report.referringOffices)),el('small','Offices with referrals in '+report.monthLabel));
    const change = el('div',undefined,'summary-card');
    const difference = report.total-report.previousTotal;
    const percent = report.previousTotal ? Math.round(difference/report.previousTotal*100) : null;
    change.append(el('p','Change from last month'),el('strong',percent===null?(report.total?'New activity':'—'):(percent>0?'+':'')+percent+'%'),el('small',(difference>0?'+':'')+difference+' referrals vs. previous full month'+(report.isCurrentMonth?' · current month in progress':'')));
    const opens=el('div',undefined,'summary-card');
    opens.append(el('p','Office link opens'),el('strong',String(report.linkOpens)),el('small','Tracked visits · NFC, QR and shared links'));
    document.querySelector('#report-summary').replaceChildren(total,opens,offices,change);
  }

  function table() {
    const rows = report.offices.map(office=>{
      const tr = el('tr'), name = el('td',office.name);
      if (!office.active && office.officeId!=='direct') name.append(el('small','Inactive card · history retained'));
      tr.append(name,el('td',office.officeId==='direct'?'—':String(office.opens)),el('td',String(office.count)));
      return tr;
    });
    if (!rows.length) {const tr=el('tr'),td=el('td','Create your first office link below.');td.colSpan=3;tr.append(td);rows.push(tr);}
    document.querySelector('#office-counts').replaceChildren(...rows);
    const totalRow=el('tr');totalRow.append(el('td','Total'),el('td',String(report.linkOpens)),el('td',String(report.total)));
    document.querySelector('#office-counts-total').replaceChildren(totalRow);
    document.querySelector('#table-month').textContent=report.monthLabel;
  }
  function canvasWidth() {return Math.max(300,Math.round(document.querySelector('#referral-chart').clientWidth || 700));}
  function rootSvg(height, label) {
    const svg=svgEl('svg',{viewBox:'0 0 '+canvasWidth()+' '+height,role:'img','aria-label':label,height});
    svg.append(svgEl('title',{},label));
    return svg;
  }
  function axisText(x,y,text,anchor='start') {return svgEl('text',{x,y,fill:'#66788b','font-size':11,'font-family':'Arial, sans-serif','text-anchor':anchor},text);}
  function bars() {
    const offices = report.offices;
    const height=Math.max(240,offices.length*66+60);
    const svg=rootSvg(height,'Referrals by office for '+report.monthLabel+'. Exact counts appear in the office breakdown table.');
    const max=Math.max(1,...offices.flatMap(r=>[r.count,r.opens]));
    const canvas=canvasWidth();
    const left=canvas<450?125:190,width=canvas-left-35;
    const ticks=[...new Set([0,Math.ceil(max/4),Math.ceil(max/2),Math.ceil(max*3/4),max])];
    ticks.forEach(n=>{const x=left+n/max*width;svg.append(svgEl('line',{x1:x,y1:25,x2:x,y2:height-25,stroke:'#e3e8ee','stroke-dasharray':'3 5'}),axisText(x,17,String(n),'middle'));});
    offices.forEach((office,i)=>{
      const y=42+i*66;
      const labelLimit=canvas<450?18:27;
      const label=office.name.length>labelLimit?office.name.slice(0,labelLimit-2)+'…':office.name;
      const name=axisText(left-16,y+17,label,'end');name.append(svgEl('title',{},office.name));svg.append(name);
      svg.append(svgEl('rect',{x:left,y,width,height:40,rx:4,fill:'#f3f5f7'}));
      const openBar=svgEl('rect',{x:left,y,width:office.opens/max*width,height:16,rx:4,fill:'#91b6ce'});
      openBar.append(svgEl('title',{},office.name+': '+office.opens+' link opens'));
      svg.append(openBar,axisText(left+office.opens/max*width+8,y+12,String(office.opens))); 
      const bar=svgEl('rect',{x:left,y:y+21,width:office.count/max*width,height:16,rx:4,fill:'#173a62'});
      bar.append(svgEl('title',{},office.name+': '+office.count+' referrals'));svg.append(bar,axisText(left+office.count/max*width+9,y+34,String(office.count)));
    });
    return svg;
  }
  function running() {
    const selected=document.querySelector('#trend-office').value;
    const metric=document.querySelector('#trend-metric').value;
    const values=report.trend.map(row=>metric==='opens'?(selected?row.officeOpens[selected]||0:row.opens):(selected?row.offices[selected]||0:row.total));
    const svg=rootSvg(300,(metric==='opens'?'Office link opens':'Completed forms')+' over the 12 months ending '+report.monthLabel+'.');
    const left=38,top=25,width=canvasWidth()-65,height=215;
    const max=Math.max(1,...values), x=i=>left+i/11*width,y=n=>top+height-n/max*height;
    [...new Set([0,Math.ceil(max/2),max])].forEach(n=>svg.append(svgEl('line',{x1:left,y1:y(n),x2:left+width,y2:y(n),stroke:'#e3e8ee'}),axisText(left-10,y(n)+4,String(n),'end')));
    svg.append(svgEl('polyline',{points:values.map((n,i)=>x(i)+','+y(n)).join(' '),fill:'none',stroke:'#173a62','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'}));
    values.forEach((n,i)=>{
      const key=report.trend[i].month;
      const point=svgEl('circle',{cx:x(i),cy:y(n),r:5,fill:'#173a62',stroke:'#fff','stroke-width':2});
      point.append(svgEl('title',{},key+': '+n+' referrals'));svg.append(point,axisText(x(i),y(n)-12,String(n),'middle'));
      if(canvasWidth()>550 || i%2===0 || i===11)svg.append(axisText(x(i),265,new Date(key+'-15T12:00:00Z').toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}),'middle'));
    });
    const rows=report.trend.map((row,i)=>{const tr=el('tr');tr.append(el('td',row.month),el('td',String(values[i])));return tr;});
    document.querySelector('#trend-counts').replaceChildren(...rows);
    return svg;
  }
  function chart() {
    const container=document.querySelector('#referral-chart');
    document.querySelector('#chart-title').textContent=view==='bars'?'Monthly office totals':'Monthly trend';
    document.querySelector('#chart-subtitle').textContent=report.monthLabel+(report.isCurrentMonth?' · month to date':' · complete month');
    document.querySelector('#view-bars').setAttribute('aria-pressed',String(view==='bars'));
    document.querySelector('#view-running').setAttribute('aria-pressed',String(view==='running'));
    document.querySelector('#trend-controls').hidden=view==='bars';
    document.querySelector('#trend-details').hidden=view==='bars';
    if(report.total===0 && report.linkOpens===0 && view==='bars')container.replaceChildren(el('p','No referrals or tracked link opens in '+report.monthLabel+'.','empty'));
    else container.replaceChildren(view==='bars'?bars():running());

  }
  function controls() {
    monthSelect.replaceChildren(...report.availableMonths.map(key=>{
      const [year,month]=key.split('-').map(Number);
      const label=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
      const option=el('option',label);option.value=key;option.selected=key===report.month;return option;
    }));
    const index=report.availableMonths.indexOf(report.month);
    document.querySelector('#previous-month').disabled=index===report.availableMonths.length-1;
    document.querySelector('#next-month').disabled=index===0;
  }
  async function refreshReport() {
    const thisRequest=++requestId;
    try {
      const data=await api('/api/staff/analytics'+(chosenMonth?'?month='+encodeURIComponent(chosenMonth):''));
      if(thisRequest!==requestId || staffSessionExpired)return;
      report=data;
      const officeSelect=document.querySelector('#trend-office'), selectedOffice=officeSelect.value;
      const all=el('option','All offices');all.value='';
      officeSelect.replaceChildren(all,...report.offices.map(office=>{const option=el('option',office.name);option.value=office.officeId;return option;}));
      officeSelect.value=report.offices.some(r=>r.officeId===selectedOffice)?selectedOffice:'';
      controls();summary();table();chart();
      document.querySelector('#report-error').textContent=report.invalidDates?'Some records have invalid submission dates and are not included in this report.':'';
      document.querySelector('#report-updated').textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+' · Mountain Time reporting';
    } catch(error) {if(!staffSessionExpired && thisRequest===requestId)document.querySelector('#report-error').textContent=error.message;}
  }
  monthSelect.addEventListener('change',()=>{chosenMonth=monthSelect.value;refreshReport();});
  document.querySelector('#previous-month').addEventListener('click',()=>{if(report){chosenMonth=report.availableMonths[report.availableMonths.indexOf(report.month)+1]||report.month;refreshReport();}});
  document.querySelector('#next-month').addEventListener('click',()=>{if(report){chosenMonth=report.availableMonths[report.availableMonths.indexOf(report.month)-1]||report.month;refreshReport();}});
  document.querySelector('#view-bars').addEventListener('click',()=>{view='bars';if(report)chart();});
  document.querySelector('#view-running').addEventListener('click',()=>{view='running';if(report)chart();});
  document.querySelector('#trend-metric').addEventListener('change',()=>{if(report)chart();});
  document.querySelector('#trend-office').addEventListener('change',()=>{if(report)chart();});
  document.addEventListener('referrals-refresh',refreshReport);
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(report)chart();},120);});
  setInterval(()=>{if(!document.hidden)refreshReport();},60000);
  refreshReport();
})();

