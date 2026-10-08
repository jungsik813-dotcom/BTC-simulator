import { InteractiveChart } from './InteractiveChart';
import React, { useEffect, useRef, useState } from 'react';
import { simulate, type Assumptions, type YearResult } from './simulation';
import { fetchBtcPrice } from './btcPrice';
import { calculateTamRange } from './tam';
import { LEGACY_STORAGE_KEY, STORAGE_KEY, compactKrw, decodeSettings, defaultInputs, defaultTamInputs, defaultPowerLawInputs, formatMoney, parseInputs, parseTamInputs, parsePowerLawInputs, type BtcModel, type Inputs, type TamInputs } from './settings';
import { PowerLawPanel } from './PowerLawPanel';
import { OnchainPanel } from './OnchainPanel';
import { defaultOnchainSettings, parseOnchainInputs } from './onchainInput';
import { calculateOnchain } from './onchain';
import { ValuationComparisonPanel } from './ValuationComparisonPanel';
import { MonteCarloPanel } from './MonteCarloPanel';
import { defaultMonteCarloSettings, parseMonteCarloSettings } from './monteCarloSettings';
import { TamPanel } from './TamPanel';
import { defaultTamAdoptionInputs, parseTamAdoptionInputs } from './tamAdoptionSettings';
import './style.css';
import './simpleUi.css';

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
export function App() {
  const [initial]=useState(()=>{try{return {...decodeSettings(localStorage.getItem(STORAGE_KEY)??localStorage.getItem(LEGACY_STORAGE_KEY)),warning:''}}catch{return {inputs:defaultInputs(),tamInputs:defaultTamInputs(),tamAdoptionInputs:defaultTamAdoptionInputs(),powerLawInputs:defaultPowerLawInputs(),onchainSettings:defaultOnchainSettings(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:true,btcModel:'cagr' as BtcModel,warning:'저장된 설정을 읽을 수 없어 기본값을 사용합니다.'}}});
  const [inputs,setInputs]=useState<Inputs>(initial.inputs);
  const [tamInputs,setTamInputs]=useState<TamInputs>(initial.tamInputs);
  const [tamAdoptionInputs,setTamAdoptionInputs]=useState(initial.tamAdoptionInputs);
  const [powerLawInputs,setPowerLawInputs]=useState(initial.powerLawInputs);
  const [onchainSettings,setOnchainSettings]=useState(initial.onchainSettings);
  const [monteCarloSettings,setMonteCarloSettings]=useState(initial.monteCarloSettings);
  const [btcModel,setBtcModel]=useState<BtcModel>(initial.btcModel);
  const [autoPrice,setAutoPrice]=useState(initial.autoPrice);
  const [saveStatus,setSaveStatus]=useState(initial.warning);
  const [visible,setVisible]=useState<Record<SeriesKey,boolean>>({btcValue:false,stocks:false,nominal:true,real:true});
  const priceRequest=useRef<AbortController|null>(null);
  const [priceLoading,setPriceLoading]=useState(false), [priceStatus,setPriceStatus]=useState('');

  async function refreshPrice(){priceRequest.current?.abort();const controller=new AbortController();priceRequest.current=controller;setPriceLoading(true);setPriceStatus('업비트 BTC 원화 시세를 가져오는 중…');try{const quote=await fetchBtcPrice(controller.signal);if(controller.signal.aborted)return;setInputs(previous=>({...previous,btcPrice:String(quote.price)}));const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(quote.tradedAt);setPriceStatus(`업비트 KRW-BTC · ${time} 체결 기준 (한국 시간)`)}catch{if(!controller.signal.aborted)setPriceStatus('시세를 가져오지 못했습니다. 기존 가격을 유지합니다. 직접 입력하거나 다시 시도해 주세요.')}finally{if(!controller.signal.aborted)setPriceLoading(false)}}
  useEffect(()=>{if(autoPrice)void refreshPrice();else{setPriceLoading(false);setPriceStatus('저장한 BTC 가격을 사용 중입니다.')}return()=>priceRequest.current?.abort()},[autoPrice]);
  useEffect(()=>{try{parseMonteCarloSettings(monteCarloSettings);parseInputs(inputs);parseTamInputs(tamInputs);parseTamAdoptionInputs(tamAdoptionInputs);parsePowerLawInputs(powerLawInputs);calculateOnchain(parseOnchainInputs(onchainSettings.inputs,onchainSettings.marketCapSource),onchainSettings.supplyMode)}catch{setSaveStatus('입력값을 확인해 주세요. 마지막 유효한 설정은 유지됩니다.');return}try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:7,inputs,tamInputs,tamAdoptionInputs,powerLawInputs,onchainSettings,monteCarloSettings,autoPrice,btcModel}));setSaveStatus('이 브라우저에 자동 저장됨')}catch{setSaveStatus('설정을 저장할 수 없습니다. 브라우저 저장 권한을 확인해 주세요.')}},[inputs,tamInputs,tamAdoptionInputs,powerLawInputs,onchainSettings,monteCarloSettings,autoPrice,btcModel]);
  function reset(){priceRequest.current?.abort();setPriceLoading(false);setInputs(defaultInputs());setTamInputs(defaultTamInputs());setTamAdoptionInputs(defaultTamAdoptionInputs());setPowerLawInputs(defaultPowerLawInputs());setOnchainSettings(defaultOnchainSettings());setMonteCarloSettings(defaultMonteCarloSettings());setBtcModel('cagr');setAutoPrice(false);setPriceStatus('예시 기본 가격으로 초기화했습니다. 현재가는 버튼으로 조회하세요.')}

  let rows:YearResult[]=[], error='';
  try{const assumptions=parseInputs(inputs);let prices:Record<number,number>|undefined;if(btcModel==='tam'){const tamRows=calculateTamRange(assumptions.startYear,assumptions.endYear,parseTamInputs(tamInputs),{initialPrice:assumptions.btcPrice,adoption:parseTamAdoptionInputs(tamAdoptionInputs,assumptions.startYear)});prices=Object.fromEntries(tamRows.map(r=>[r.year,r.btcPrice]))}rows=simulate(assumptions,prices)}catch(e){error=(e as Error).message}
  const first=rows[0],last=rows.at(-1);

  function renderField(key:keyof Assumptions) {
    const f=fields.find(field=>field.key===key)!;
    const numeric=Number(inputs[f.key]),year=f.key==='startYear'||f.key==='endYear',rate=f.unit==='%',yearMinimum=btcModel==='tam'?2024:1900,minimum=year?yearMinimum:(f.key==='btcReturn'||f.key==='inflation'||f.key==='stockReturn')?-100:0,exclusive=f.key==='btcPrice'||f.key==='btcReturn'||f.key==='inflation';
    const invalid=inputs[f.key].trim()===''||!Number.isFinite(numeric)||(exclusive?numeric<=minimum:numeric<minimum)||(year&&(!Number.isInteger(numeric)||numeric>2200))||(f.key==='endYear'&&numeric<Number(inputs.startYear));
    const hint=year?'':rate?'':f.key==='btcQuantity'?'':Number.isFinite(numeric)?compactKrw(numeric):'';
    return <label key={f.key}><span>{f.key==='endYear'?'몇 년까지 볼까요?':f.label}</span><div className={`input-wrap ${invalid?'invalid':''}`}><input type="number" min={minimum} max={year?2200:undefined} step={f.step??'1'} value={inputs[f.key]} aria-invalid={invalid} disabled={f.key==='btcPrice'&&priceLoading} onChange={e=>{setInputs(previous=>({...previous,[f.key]:e.target.value}));if(f.key==='btcPrice'){setAutoPrice(false);setPriceStatus('직접 입력한 BTC 가격을 사용 중입니다.')}}}/><span>{f.unit==='KRW'?'원':f.unit}</span></div>{(invalid||hint)&&<span className={invalid?'field-error':'field-hint'}>{invalid?'입력 범위를 확인해 주세요.':hint}</span>}</label>;
  }
  let tamIssue='',mcIssue='',powerIssue='',onchainIssue='';
  try{parseTamInputs(tamInputs);parseTamAdoptionInputs(tamAdoptionInputs,Number(inputs.startYear))}catch(e){tamIssue=(e as Error).message}
  try{parseMonteCarloSettings(monteCarloSettings)}catch(e){mcIssue=(e as Error).message}
  try{parsePowerLawInputs(powerLawInputs)}catch(e){powerIssue=(e as Error).message}
  try{calculateOnchain(parseOnchainInputs(onchainSettings.inputs,onchainSettings.marketCapSource),onchainSettings.supplyMode)}catch(e){onchainIssue=(e as Error).message}
  const extraInvalid=inputs.startYear.trim()===''||!Number.isInteger(Number(inputs.startYear))||Number(inputs.startYear)<(btcModel==='tam'?2024:1900)||Number(inputs.startYear)>2200||inputs.btcPrice.trim()===''||!Number.isFinite(Number(inputs.btcPrice))||Number(inputs.btcPrice)<=0||inputs.inflation.trim()===''||!Number.isFinite(Number(inputs.inflation))||Number(inputs.inflation)<=-100||inputs.debtRate.trim()===''||!Number.isFinite(Number(inputs.debtRate))||Number(inputs.debtRate)<0;
  return <main className="simple-app">
    <header className="app-header"><div><p className="eyebrow">MY ASSET PLAN</p><h1>나의 자산 계획</h1><p>지금의 자산과 매달의 투자로 미래를 살펴보세요.</p></div><span className="app-save" role="status">{saveStatus}</span></header>
    <section className="summary" aria-label="순자산 요약">{[
      ['현재 순자산',first?.nominal,`${inputs.startYear}년 기준`],
      [`${inputs.endYear}년 예상 순자산`,last?.nominal,'입력한 가정대로 투자했을 때'],
      ['물가를 반영한 미래 가치',last?.real,`지금의 구매력으로 환산 · 물가 ${inputs.inflation}%`],
    ].map(([label,value,note])=><article className="card" key={String(label)}><p>{label}</p><strong>{typeof value==='number'?compactKrw(value):'계산 대기'}</strong><small>{typeof value==='number'?formatMoney(value).replace(' KRW','원'):'입력값을 확인해 주세요.'}</small><span>{note}</span></article>)}</section>
    <div className="workspace">
      <section className="card assumptions" aria-labelledby="portfolio-title">
        <p className="eyebrow">01 · 나의 입력</p><h2 id="portfolio-title">내 자산과 투자 계획</h2>
        <div className="input-group"><h3>지금 보유한 자산</h3><div className="fields">{(['btcQuantity','stocks','cash','debt'] as const).map(renderField)}</div></div>
        <div className="input-group"><h3>매달 투자할 금액</h3><div className="fields">{(['monthlyBtc','monthlyStocks'] as const).map(renderField)}</div></div>
        <div className="input-group"><h3>미래를 보는 가정</h3><div className="fields">{renderField('endYear')}{btcModel==='cagr'&&renderField('btcReturn')}{renderField('stockReturn')}</div>{btcModel==='tam'&&<p className="model-active-note">BTC는 시장 채택 가정(TAM)을 사용 중입니다. 아래 ‘BTC 시장 채택 가정’에서 수정할 수 있습니다.</p>}</div>
        <details className="ui-inline-disclosure" open={error&&extraInvalid?true:undefined}><summary>추가 가정과 현재가 설정</summary>
          <div className="fields">{(['startYear','btcPrice','inflation','debtRate'] as const).map(renderField)}</div>
          <div className="price-controls"><label className="check-label"><input type="checkbox" checked={autoPrice} onChange={e=>setAutoPrice(e.target.checked)}/>접속 시 BTC 현재가 가져오기</label><button type="button" disabled={priceLoading} onClick={()=>void refreshPrice()}>{priceLoading?'가져오는 중…':'현재가 새로고침'}</button><p className="muted" role="status">{priceStatus}</p></div>
          <h3>BTC 미래 가격을 정하는 방법</h3><div className="segment" role="group" aria-label="BTC 가격 가정"><button aria-pressed={btcModel==='cagr'} className={btcModel==='cagr'?'active':''} onClick={()=>setBtcModel('cagr')}>연 수익률로 계산</button><button aria-pressed={btcModel==='tam'} className={btcModel==='tam'?'active':''} onClick={()=>setBtcModel('tam')}>시장 채택으로 계산</button></div>
          <button type="button" className="text-button ui-reset" onClick={reset}>전체 가정을 기본값으로 되돌리기</button>
        </details>
      </section>
      <section className="card result-card" aria-labelledby="results-title">
        <div className="section-heading"><div><p className="eyebrow">02 · 나의 결과</p><h2 id="results-title">시간에 따른 순자산</h2></div><span className="unit-pill">{inputs.startYear}–{inputs.endYear}년</span></div>
        <p className="muted">입력값을 바꾸면 결과가 바로 달라집니다.</p>
        {error?<p className="error inline-error" role="alert">{error}</p>:<><AssetChart rows={rows} visible={visible}/><div className="ui-chart-legend">{series.filter(s=>visible[s.key]).map(s=><span key={s.key}><i style={{background:s.color}}/>{s.key==='nominal'?'예상 순자산':s.key==='real'?'물가 반영 순자산':s.label}</span>)}</div></>}
        <details className="ui-inline-disclosure"><summary>그래프에 표시할 항목</summary><div className="chart-toggles">{series.map(s=><label className="check-label" key={s.key}><input type="checkbox" checked={visible[s.key]} onChange={e=>setVisible({...visible,[s.key]:e.target.checked})}/>{s.key==='nominal'?'예상 순자산':s.key==='real'?'물가 반영 순자산':s.label}</label>)}</div></details>
        <details className="ui-inline-disclosure"><summary>연도별 자세한 금액</summary><div className="table-scroll"><table><thead><tr>{['연도','BTC 가격','BTC 수량','BTC 평가액','주식','현금','부채','순자산','물가 반영 순자산'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.year}><th>{r.year}</th>{[r.btcPrice,r.btcQuantity,r.btcValue,r.stocks,r.cash,r.debt,r.nominal,r.real].map((v,i)=><td key={i}>{i===1?v.toFixed(8):money(v)}</td>)}</tr>)}</tbody></table></div></details>
        <details className="ui-inline-disclosure"><summary>결과를 읽는 방법</summary><p className="muted">예상 순자산은 입력한 가정을 그대로 적용한 금액입니다. 물가 반영 순자산은 시작 연도의 구매력으로 환산한 금액입니다. 월 투자금은 외부 소득으로 추가하며 현금에서 차감하지 않습니다. 부채는 이율에 따라 증가합니다.</p></details>
      </section>
    </div>
    <div className="optional-heading"><h2>필요할 때 더 자세히</h2><p>세부 가정과 참고 모델은 아래에서 펼쳐볼 수 있습니다.</p></div>
    <details className="ui-disclosure" open={mcIssue?true:undefined}><summary><span><b>여러 가능성으로 살펴보기</b><small>변동성을 반영한 결과 범위 · Monte Carlo</small></span><em>{mcIssue?'입력 확인':'선택 기능'}</em></summary><div className="disclosure-body"><MonteCarloPanel portfolio={inputs} tamInputs={tamInputs} tamAdoptionInputs={tamAdoptionInputs} settings={monteCarloSettings} onChange={setMonteCarloSettings}/></div></details>
    <details className="ui-disclosure" id="tam-settings" open={tamIssue?true:undefined}><summary><span><b>BTC 시장 채택 가정</b><small>채택 속도와 목표를 직접 조정 · TAM</small></span><em>{tamIssue?'입력 확인':btcModel==='tam'?'현재 적용 중':'선택 기능'}</em></summary><div className="disclosure-body"><TamPanel portfolio={inputs} inputs={tamInputs} adoptionInputs={tamAdoptionInputs} onChange={setTamInputs} onAdoptionChange={setTamAdoptionInputs}/></div></details>
    <details className="ui-disclosure" open={powerIssue||onchainIssue?true:undefined}><summary><span><b>참고 모델과 지표</b><small>BTC 평가 모델 비교 · Power Law · 온체인</small></span><em>{powerIssue||onchainIssue?'입력 확인':'참고용'}</em></summary><div className="disclosure-body">
      <details className="ui-inline-disclosure"><summary>모델별 가격 비교</summary><ValuationComparisonPanel portfolio={inputs} tamInputs={tamInputs} tamAdoptionInputs={tamAdoptionInputs} powerLawInputs={powerLawInputs} onchainSettings={onchainSettings} priceModel={btcModel}/></details>
      <details className="ui-inline-disclosure" open={powerIssue?true:undefined}><summary>장기 가격 추세 가정 · Power Law</summary><PowerLawPanel portfolio={inputs} tamInputs={tamInputs} tamAdoptionInputs={tamAdoptionInputs} inputs={powerLawInputs} onChange={setPowerLawInputs} showComparison={false}/></details>
      <details className="ui-inline-disclosure" open={onchainIssue?true:undefined}><summary>온체인 참고 지표</summary><OnchainPanel settings={onchainSettings} onChange={setOnchainSettings}/></details>
    </div></details>
    <footer>입력한 가정에 따른 시나리오입니다. 설정은 이 브라우저에 저장됩니다.</footer>
  </main>;
}
