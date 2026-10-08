import { InteractiveChart } from './InteractiveChart';
import React, { useEffect, useRef, useState } from 'react';
import { simulate, type Assumptions, type YearResult } from './simulation';
import { fetchBtcPrice } from './btcPrice';
import { LEGACY_STORAGE_KEY, STORAGE_KEY, compactKrw, decodeSettings, defaultInputs, formatMoney, parseInputs, type Inputs } from './settings';
import { MonteCarloPanel, MonteCarloFanChart, MonteCarloResults, RunAssumptions } from './MonteCarloPanel';
import { defaultMonteCarloSettings, parseMonteCarloSettings } from './monteCarloSettings';
import './style.css';
import './simpleUi.css';
import { useMonteCarlo } from './useMonteCarlo';
import { DEFAULT_POWER_LAW_BETA, parsePowerLawBeta, simulatePowerLaw } from './powerLaw';

import { PowerLawScenarios } from './PowerLawScenarios';

const money = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value);
const fields: { key: keyof Assumptions; label: string; unit: string; step?: string }[] = [
  {key:'startYear',label:'시작 연도',unit:'년'}, {key:'endYear',label:'종료 연도',unit:'년'},
  {key:'btcQuantity',label:'현재 BTC 보유 수량',unit:'BTC',step:'any'}, {key:'btcPrice',label:'현재 BTC 가격',unit:'KRW / BTC'},
  {key:'stocks',label:'현재 주식 자산',unit:'KRW'}, {key:'cash',label:'현재 현금',unit:'KRW'},
  {key:'debt',label:'현재 부채',unit:'KRW'}, {key:'monthlyBtc',label:'월 BTC 투자금',unit:'KRW'},
  {key:'monthlyStocks',label:'월 주식 투자금',unit:'KRW'}, {key:'btcReturn',label:'BTC 연평균 수익률',unit:'%',step:'any'},
  {key:'stockReturn',label:'주식 연평균 수익률',unit:'%',step:'any'}, {key:'debtRate',label:'부채 연이율',unit:'%',step:'any'},
  {key:'inflation',label:'연간 물가상승률',unit:'%',step:'any'},
];
const series = [
  {key:'btcValue', label:'BTC 평가액', color:'#246957'}, {key:'stocks', label:'주식', color:'#57769c'},
  {key:'nominal', label:'명목 순자산', color:'#24332f'}, {key:'real', label:'실질 순자산', color:'#84918b'},
] as const;
type SeriesKey = typeof series[number]['key'];

function AssetChart({rows, visible}: {rows: YearResult[]; visible: Record<SeriesKey, boolean>}) {
  const width=900, height=280, left=95, right=25, top=25, bottom=45;
  const active=series.filter(s=>visible[s.key]);
  if (!active.length) return <p className="empty-chart">비교할 항목을 하나 이상 선택해 주세요.</p>;
  const values=rows.flatMap(r=>active.map(s=>r[s.key]));
  const minimum=Math.min(0,...values), maximum=Math.max(1,...values), range=maximum-minimum;
  const x=(i:number)=>left+i/Math.max(1,rows.length-1)*(width-left-right);
  const y=(v:number)=>top+(maximum-v)/range*(height-top-bottom);
  return <InteractiveChart width={width} height={height} left={left} right={right} top={top} bottom={bottom} label={`연도별 ${active.map(s=>s.label).join(', ')} 비교 그래프`} data={rows.map(r=>({year:r.year,entries:active.map(s=>({label:s.key==='nominal'?'예상 순자산':s.key==='real'?'물가 반영 순자산':s.label,value:formatMoney(r[s.key]).replace(' KRW','원'),color:s.color,y:y(r[s.key])}))}))}>
    {[0,1,2,3,4].map(i=>{const v=minimum+range*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#e5e9ee"/><text x={left-12} y={y(v)+4} textAnchor="end">{money(v/100000000)}억</text></g>})}
    {active.map(s=><g key={s.key}><polyline points={rows.map((r,i)=>`${x(i)},${y(r[s.key])}`).join(' ')} fill="none" stroke={s.color} strokeWidth={s.key==='nominal'?3:2} strokeDasharray={s.key==='real'?'7 5':undefined}/>{rows.map((r,i)=><circle key={r.year} cx={x(i)} cy={y(r[s.key])} r="3" fill={s.color}><title>{`${r.year}년 · ${s.label}: ${formatMoney(r[s.key])}`}</title></circle>)}</g>)}
    {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y={height-12} textAnchor="middle">{rows[i].year}</text>)}
  </InteractiveChart>;
}
export function App({initialChartMode='cagr'}:{initialChartMode?:'cagr'|'monteCarlo'|'powerLaw'}={}) {
  const [initial]=useState(()=>{try{return {...decodeSettings(localStorage.getItem(STORAGE_KEY)??localStorage.getItem(LEGACY_STORAGE_KEY)),warning:''}}catch{return {inputs:defaultInputs(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:true,powerLawBeta:String(DEFAULT_POWER_LAW_BETA),warning:'저장된 설정을 읽을 수 없어 기본값을 사용합니다.'}}});
  const [inputs,setInputs]=useState<Inputs>(initial.inputs);
  const [monteCarloSettings,setMonteCarloSettings]=useState(initial.monteCarloSettings);
  const [chartMode,setChartMode]=useState<'cagr'|'monteCarlo'|'powerLaw'>(initialChartMode);
  const [powerLawBeta,setPowerLawBeta]=useState(initial.powerLawBeta);
  const [metric,setMetric]=useState<'nominal'|'real'>('nominal');
  const mc=useMonteCarlo(inputs,monteCarloSettings);
  const [autoPrice,setAutoPrice]=useState(initial.autoPrice);
  const [saveStatus,setSaveStatus]=useState(initial.warning);
  const [visible,setVisible]=useState<Record<SeriesKey,boolean>>({btcValue:false,stocks:false,nominal:true,real:true});
  const priceRequest=useRef<AbortController|null>(null);
  const [priceLoading,setPriceLoading]=useState(false), [priceStatus,setPriceStatus]=useState('');

  async function refreshPrice(){priceRequest.current?.abort();const controller=new AbortController();priceRequest.current=controller;setPriceLoading(true);setPriceStatus('업비트 BTC 원화 시세를 가져오는 중…');try{const quote=await fetchBtcPrice(controller.signal);if(controller.signal.aborted)return;setInputs(previous=>({...previous,btcPrice:String(quote.price)}));const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(quote.tradedAt);setPriceStatus(`업비트 KRW-BTC · ${time} 체결 기준 (한국 시간)`)}catch{if(!controller.signal.aborted)setPriceStatus('시세를 가져오지 못했습니다. 기존 가격을 유지합니다. 직접 입력하거나 다시 시도해 주세요.')}finally{if(!controller.signal.aborted)setPriceLoading(false)}}
  useEffect(()=>{if(autoPrice)void refreshPrice();else{setPriceLoading(false);setPriceStatus('저장한 BTC 가격을 사용 중입니다.')}return()=>priceRequest.current?.abort()},[autoPrice]);
  useEffect(()=>{try{parseMonteCarloSettings(monteCarloSettings);parseInputs(inputs);parsePowerLawBeta(powerLawBeta)}catch{setSaveStatus('입력값을 확인해 주세요. 마지막 유효한 설정은 유지됩니다.');return}try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:10,inputs,monteCarloSettings,autoPrice,powerLawBeta}));setSaveStatus('이 브라우저에 자동 저장됨')}catch{setSaveStatus('설정을 저장할 수 없습니다. 브라우저 저장 권한을 확인해 주세요.')}},[inputs,monteCarloSettings,autoPrice,powerLawBeta]);
  function reset(){priceRequest.current?.abort();setPriceLoading(false);setInputs(defaultInputs());setMonteCarloSettings(defaultMonteCarloSettings());setPowerLawBeta(String(DEFAULT_POWER_LAW_BETA));setAutoPrice(false);setPriceStatus('예시 기본 가격으로 초기화했습니다. 현재가는 버튼으로 조회하세요.')}

  let rows:YearResult[]=[], error='';
  try{rows=simulate(parseInputs(inputs))}catch(e){error=(e as Error).message}
  let powerRows:YearResult[]=[],powerError='';
  try{powerRows=simulatePowerLaw(parseInputs(inputs),parsePowerLawBeta(powerLawBeta))}catch(e){powerError=(e as Error).message}
  const deterministicRows=chartMode==='powerLaw'?powerRows:rows;
  const deterministicError=chartMode==='powerLaw'?powerError:error;
  const first=rows[0],last=deterministicRows.at(-1);
  const mcLast=mc.completed?.result.rows.at(-1);
  const resultYear=chartMode==='monteCarlo'&&mcLast?mcLast.year:inputs.endYear;

  function renderField(key:keyof Assumptions) {
    const f=fields.find(field=>field.key===key)!;
    const numeric=Number(inputs[f.key]),year=f.key==='startYear'||f.key==='endYear',rate=f.unit==='%',yearMinimum=1900,minimum=year?yearMinimum:(f.key==='btcReturn'||f.key==='inflation'||f.key==='stockReturn')?-100:0,exclusive=f.key==='btcPrice'||f.key==='btcReturn'||f.key==='inflation';
    const invalid=inputs[f.key].trim()===''||!Number.isFinite(numeric)||(exclusive?numeric<=minimum:numeric<minimum)||(year&&(!Number.isInteger(numeric)||numeric>2200))||(f.key==='endYear'&&numeric<Number(inputs.startYear));
    const hint=year?'':rate?'':f.key==='btcQuantity'?'':Number.isFinite(numeric)?compactKrw(numeric):'';
    return <label key={f.key}><span>{f.key==='endYear'?'몇 년까지 볼까요?':f.label}</span><div className={`input-wrap ${invalid?'invalid':''}`}><input type="number" min={minimum} max={year?2200:undefined} step={f.step??'1'} value={inputs[f.key]} aria-invalid={invalid} disabled={f.key==='btcPrice'&&priceLoading} onChange={e=>{setInputs(previous=>({...previous,[f.key]:e.target.value}));if(f.key==='btcPrice'){setAutoPrice(false);setPriceStatus('직접 입력한 BTC 가격을 사용 중입니다.')}}}/><span>{f.unit==='KRW'?'원':f.unit}</span></div>{(invalid||hint)&&<span className={invalid?'field-error':'field-hint'}>{invalid?'입력 범위를 확인해 주세요.':hint}</span>}</label>;
  }
  let mcIssue='';
  try{parseMonteCarloSettings(monteCarloSettings)}catch(e){mcIssue=(e as Error).message}
  const extraInvalid=inputs.startYear.trim()===''||!Number.isInteger(Number(inputs.startYear))||Number(inputs.startYear)<1900||Number(inputs.startYear)>2200||inputs.btcPrice.trim()===''||!Number.isFinite(Number(inputs.btcPrice))||Number(inputs.btcPrice)<=0||inputs.inflation.trim()===''||!Number.isFinite(Number(inputs.inflation))||Number(inputs.inflation)<=-100||inputs.debtRate.trim()===''||!Number.isFinite(Number(inputs.debtRate))||Number(inputs.debtRate)<0;
  return <main className="simple-app">
    <header className="app-header"><div><p className="eyebrow">MY ASSET PLAN</p><h1>나의 자산 계획</h1><p>지금의 자산과 매달의 투자로 미래를 살펴보세요.</p></div><span className="app-save" role="status">{saveStatus}</span></header>
    <section className="summary" aria-label="순자산 요약">{[
      ['현재 순자산',first?.nominal,`${inputs.startYear}년 기준`],
      [`${resultYear}년 ${chartMode==='monteCarlo'?'순자산 중앙값':'예상 순자산'}`,chartMode==='monteCarlo'?mcLast?.nominal.p50:last?.nominal,chartMode==='monteCarlo'?'Monte Carlo · 100,000회 결과':chartMode==='powerLaw'?`Power Law · β ${powerLawBeta}`:'CAGR · 입력한 성장률 적용'],
      ['물가를 반영한 미래 가치',chartMode==='monteCarlo'?mcLast?.real.p50:last?.real,chartMode==='monteCarlo'?'Monte Carlo · 실질 순자산 중앙값':`지금의 구매력으로 환산 · 물가 ${inputs.inflation}%`],
    ].map(([label,value,note])=><article className="card" key={String(label)}><p>{label}</p><strong>{typeof value==='number'?compactKrw(value):'계산 대기'}</strong><small>{typeof value==='number'?formatMoney(value).replace(' KRW','원'):'입력값을 확인해 주세요.'}</small><span>{note}</span></article>)}</section>
    <div className="workspace">
      <section className="card assumptions" aria-labelledby="portfolio-title">
        <p className="eyebrow">01 · 나의 입력</p><h2 id="portfolio-title">내 자산과 투자 계획</h2>
        <div className="input-group"><h3>지금 보유한 자산</h3><div className="fields">{(['btcQuantity','stocks','cash','debt'] as const).map(renderField)}</div></div>
        <div className="input-group"><h3>매달 투자할 금액</h3><div className="fields">{(['monthlyBtc','monthlyStocks'] as const).map(renderField)}</div></div>
        <div className="input-group"><h3>미래를 보는 가정</h3><div className="fields">{renderField('endYear')}{chartMode!=='powerLaw'&&renderField('btcReturn')}{renderField('stockReturn')}</div></div>
        <details className="ui-inline-disclosure" open={error&&extraInvalid?true:undefined}><summary>추가 가정과 현재가 설정</summary>
          <div className="fields">{(['startYear','btcPrice','inflation','debtRate'] as const).map(renderField)}</div>
          <div className="price-controls"><label className="check-label"><input type="checkbox" checked={autoPrice} onChange={e=>setAutoPrice(e.target.checked)}/>접속 시 BTC 현재가 가져오기</label><button type="button" disabled={priceLoading} onClick={()=>void refreshPrice()}>{priceLoading?'가져오는 중…':'현재가 새로고침'}</button><p className="muted" role="status">{priceStatus}</p></div>
          <button type="button" className="text-button ui-reset" onClick={reset}>전체 가정을 기본값으로 되돌리기</button>
        </details>
      </section>
      <section className="card result-card" aria-labelledby="results-title">
        <div className="section-heading"><div><p className="eyebrow">02 · 나의 결과</p><h2 id="results-title">시간에 따른 순자산</h2></div><span className="unit-pill">{inputs.startYear}–{inputs.endYear}년</span></div>
        <div className="segment" role="group" aria-label="그래프 계산 방식" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}><button className={chartMode==='cagr'?'active':''} aria-pressed={chartMode==='cagr'} onClick={()=>setChartMode('cagr')}>CAGR · 가정대로 성장</button><button className={chartMode==='monteCarlo'?'active':''} aria-pressed={chartMode==='monteCarlo'} onClick={()=>setChartMode('monteCarlo')}>Monte Carlo · 결과 범위</button><button className={chartMode==='powerLaw'?'active':''} aria-pressed={chartMode==='powerLaw'} onClick={()=>setChartMode('powerLaw')}>Power Law · 현재가 기준</button></div>
        <p className="muted" style={{marginTop:16}}>{chartMode==='powerLaw'?`BTC: 현재가 기준 Power Law · β ${powerLawBeta}`:`연동 가정: BTC ${inputs.btcReturn}%`} · 주식 {inputs.stockReturn}% · 물가 {inputs.inflation}%</p>
        {chartMode==='powerLaw'&&<div className="power-beta-control"><label><span>Power Law 베타 β</span><div className="input-wrap"><input aria-label="Power Law 베타" type="number" min="0" step="0.1" value={powerLawBeta} aria-invalid={!!powerError} onChange={e=>setPowerLawBeta(e.target.value)}/><span>시작 가격을 유지하며 미래 성장 기울기를 조절합니다.</span></div></label><p className="muted">입력한 현재 BTC 가격에서 출발합니다. 베타를 바꿔도 시작 가격과 순자산은 유지됩니다.</p><details className="ui-inline-disclosure"><summary>Power Law 계산 기준</summary><p className="muted">미래 BTC 가격 = 현재 가격 × (미래 경과일수 / 시작 경과일수)<sup>β</sup>. 경과일수는 2009-01-03부터 각 연도 1월 1일 UTC까지입니다. 시작 연도는 2010년 이후로 설정하세요. 베타가 클수록 성장 기울기가 커지고, 베타 0은 가격이 일정합니다. 기본 5.845는 조정 가능한 성장 가정입니다. 연간 투자금(월 투자금 × 12)은 다음 연도 스냅샷 가격으로 매수하는 근사이며, 매수와 평가에 같은 가격을 사용합니다. 주식·현금·부채·물가는 공통 가정을 적용합니다.</p></details></div>}
        {chartMode==='monteCarlo'&&<>
        <div className="mc-actions"><button className="mc-run" disabled={mc.busy||!!mc.validation} onClick={()=>{mc.run();setChartMode('monteCarlo')}}>{mc.busy?'100,000회 계산 중…':'Monte Carlo 100,000회 실행'}</button>{mc.busy&&<button onClick={mc.cancel}>계산 취소</button>}<span role="status">{mc.busy?`${mc.progress}%`:mc.completed?'시뮬레이션 완료':''}</span></div>
        {mc.busy&&<progress value={mc.progress} max={100} aria-label="시뮬레이션 진행률"/>}
        {mc.validation&&<p className="error inline-error" role="alert">{mc.validation}</p>}
        {mc.error&&<p className="error inline-error" role="alert">{mc.error}</p>}
        </>}
        {chartMode==='monteCarlo'&&mc.stale&&<p className="mc-notice" role="status">입력값이 변경되었습니다. 아래 금액과 중앙값은 이전 가정의 결과입니다. 100,000회 실행으로 갱신해 주세요.</p>}
        {chartMode==='monteCarlo'?<>{mc.completed?<><div className="segment" role="group" aria-label="Monte Carlo 금액 기준"><button aria-pressed={metric==='nominal'} className={metric==='nominal'?'active':''} onClick={()=>setMetric('nominal')}>예상 순자산</button><button aria-pressed={metric==='real'} className={metric==='real'?'active':''} onClick={()=>setMetric('real')}>물가 반영 순자산</button></div><MonteCarloFanChart key="monteCarlo" rows={mc.completed.result.rows} metric={metric}/><MonteCarloResults result={mc.completed.result} metric={metric}/><RunAssumptions request={mc.completed.request}/></>:<p className="empty-chart">{mc.busy?'시뮬레이션을 계산하고 있습니다.':'위의 100,000회 실행 버튼을 눌러 결과를 확인하세요.'}</p>}</>:deterministicError?<p className="error inline-error" role="alert">{deterministicError}</p>:chartMode==='powerLaw'?<PowerLawScenarios rows={powerRows} metric={metric} onMetricChange={setMetric}/>:<><AssetChart key={chartMode} rows={deterministicRows} visible={visible}/><div className="ui-chart-legend">{series.filter(s=>visible[s.key]).map(s=><span key={s.key}><i style={{background:s.color}}/>{s.key==='nominal'?'예상 순자산':s.key==='real'?'물가 반영 순자산':s.label}</span>)}</div></>}
        {chartMode==='cagr'&&<><details className="ui-inline-disclosure"><summary>그래프에 표시할 항목</summary><div className="chart-toggles">{series.map(s=><label className="check-label" key={s.key}><input type="checkbox" checked={visible[s.key]} onChange={e=>setVisible({...visible,[s.key]:e.target.checked})}/>{s.key==='nominal'?'예상 순자산':s.key==='real'?'물가 반영 순자산':s.label}</label>)}</div></details>
        <details className="ui-inline-disclosure"><summary>연도별 자세한 금액</summary><div className="table-scroll"><table><thead><tr>{['연도','BTC 가격','BTC 수량','BTC 평가액','주식','현금','부채','순자산','물가 반영 순자산'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{deterministicRows.map(r=><tr key={r.year}><th>{r.year}</th>{[r.btcPrice,r.btcQuantity,r.btcValue,r.stocks,r.cash,r.debt,r.nominal,r.real].map((v,i)=><td key={i}>{i===1?v.toFixed(8):money(v)}</td>)}</tr>)}</tbody></table></div></details>
        </>}
        <details className="ui-inline-disclosure"><summary>결과를 읽는 방법</summary><p className="muted">예상 순자산은 입력한 가정을 그대로 적용한 금액입니다. 물가 반영 순자산은 시작 연도의 구매력으로 환산한 금액입니다. 월 투자금은 외부 소득으로 추가하며 현금에서 차감하지 않습니다. 부채는 이율에 따라 증가합니다.</p></details>
      </section>
    </div>
    <div className="optional-heading"><h2>추가 시뮬레이션 설정</h2><p>성장률과 물가는 상단 입력에서, 변동성과 환율은 아래에서 조정합니다.</p></div>
    <details className="ui-disclosure" open={mcIssue?true:undefined}><summary><span><b>변동성·환율·시장 움직임</b><small>Monte Carlo 세부 가정 · 결과는 위 그래프에 표시</small></span><em>{mcIssue?'입력 확인':'선택 기능'}</em></summary><div className="disclosure-body"><MonteCarloPanel portfolio={inputs} settings={monteCarloSettings} onChange={setMonteCarloSettings}/></div></details>
    <footer>입력한 가정에 따른 시나리오입니다. 설정은 이 브라우저에 저장됩니다.</footer>
  </main>;
}
