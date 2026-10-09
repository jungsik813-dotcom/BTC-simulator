import { CurrencyProvider, CurrencyToggle, useCurrency } from './CurrencyProvider';
import { CurrencyAmountInput } from './CurrencyAmountInput';
import { useEffect, useRef, useState } from 'react';
import { simulate, type Assumptions, type YearResult } from './simulation';
import { fetchBtcPrice } from './btcPrice';
import { LEGACY_STORAGE_KEY, STORAGE_KEY, SETTINGS_VERSION, decodeSettings, defaultInputs, parseInputs, type Inputs } from './settings';
import { MonteCarloPanel, MonteCarloFanChart, MonteCarloResults, RunAssumptions } from './MonteCarloPanel';
import { defaultMonteCarloSettings, parseMonteCarloSettings } from './monteCarloSettings';
import { useMonteCarlo } from './useMonteCarlo';
import { DEFAULT_POWER_LAW_BETA, parsePowerLawBeta, simulatePowerLaw } from './powerLaw';
import { BtcChart } from './BtcChart';
import './style.css';
import './simpleUi.css';
import './mobile.css';

type ChartMode='cagr'|'monteCarlo'|'powerLaw';
const fields:{key:keyof Assumptions;label:string;unit:string;step?:string}[]=[
  {key:'btcQuantity',label:'현재 BTC 수량',unit:'BTC',step:'any'},
  {key:'btcPrice',label:'현재 BTC 가격',unit:'원 / BTC'},
  {key:'monthlyBtc',label:'월 BTC 투자금',unit:'원'},
  {key:'endYear',label:'목표 연도',unit:'년'},
  {key:'btcReturn',label:'BTC 연수익률',unit:'%',step:'any'},
  {key:'startYear',label:'시작 연도',unit:'년'},
];
function BitcoinApp({initialChartMode='cagr'}:{initialChartMode?:ChartMode}={}) {
  const display=useCurrency();
  const [initial]=useState(()=>{try{return {...decodeSettings(localStorage.getItem(STORAGE_KEY)??localStorage.getItem(LEGACY_STORAGE_KEY)),warning:''}}catch{return {inputs:defaultInputs(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:true,powerLawBeta:String(DEFAULT_POWER_LAW_BETA),warning:'저장된 설정을 읽을 수 없어 기본값을 사용합니다.'}}});
  const [inputs,setInputs]=useState<Inputs>(initial.inputs);
  const [monteCarloSettings,setMonteCarloSettings]=useState(initial.monteCarloSettings);
  const [chartMode,setChartMode]=useState<ChartMode>(initialChartMode);
  const [powerLawBeta,setPowerLawBeta]=useState(initial.powerLawBeta);
  const mc=useMonteCarlo(inputs,monteCarloSettings);
  const [autoPrice,setAutoPrice]=useState(initial.autoPrice);
  const [saveStatus,setSaveStatus]=useState(initial.warning);
  const priceRequest=useRef<AbortController|null>(null);
  const [priceLoading,setPriceLoading]=useState(false),[priceStatus,setPriceStatus]=useState('');
  async function refreshPrice(){priceRequest.current?.abort();const controller=new AbortController();priceRequest.current=controller;setPriceLoading(true);setPriceStatus('업비트 BTC 원화 시세를 가져오는 중…');try{const quote=await fetchBtcPrice(controller.signal);if(controller.signal.aborted)return;setInputs(previous=>({...previous,btcPrice:String(quote.price)}));const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(quote.tradedAt);setPriceStatus(`업비트 KRW-BTC · ${time} 체결 기준 (한국 시간)`)}catch{if(!controller.signal.aborted)setPriceStatus('시세를 가져오지 못했습니다. 기존 가격을 유지합니다. 직접 입력하거나 다시 시도해 주세요.')}finally{if(!controller.signal.aborted)setPriceLoading(false)}}
  useEffect(()=>{if(autoPrice)void refreshPrice();else{setPriceLoading(false);setPriceStatus('저장한 BTC 가격을 사용 중입니다.')}return()=>priceRequest.current?.abort()},[autoPrice]);
  useEffect(()=>{try{parseMonteCarloSettings(monteCarloSettings);parseInputs(inputs);parsePowerLawBeta(powerLawBeta)}catch{setSaveStatus('입력값을 확인해 주세요. 마지막 유효한 설정은 유지됩니다.');return}try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:SETTINGS_VERSION,inputs,monteCarloSettings,autoPrice,powerLawBeta}));setSaveStatus('이 브라우저에 자동 저장됨')}catch{setSaveStatus('설정을 저장할 수 없습니다. 브라우저 저장 권한을 확인해 주세요.')}},[inputs,monteCarloSettings,autoPrice,powerLawBeta]);
  function reset(){priceRequest.current?.abort();setPriceLoading(false);setInputs(defaultInputs());setMonteCarloSettings(defaultMonteCarloSettings());setPowerLawBeta(String(DEFAULT_POWER_LAW_BETA));setAutoPrice(false);setPriceStatus('예시 기본 가격으로 초기화했습니다. 현재가는 버튼으로 조회하세요.')}

  let rows:YearResult[]=[],error='';
  try{const a=parseInputs(inputs);rows=chartMode==='powerLaw'?simulatePowerLaw(a,parsePowerLawBeta(powerLawBeta)):simulate(a)}catch(e){error=(e as Error).message}
  const last=rows.at(-1),mcLast=mc.completed?.result.rows.at(-1);
  const futureValue=chartMode==='monteCarlo'?mcLast?.btcValue.p50:last?.btcValue;
  const resultYear=chartMode==='monteCarlo'&&mcLast?mcLast.year:inputs.endYear;
  const initialValue=Number(inputs.btcQuantity)*Number(inputs.btcPrice);
  const currentValue=inputs.btcQuantity.trim()!==''&&inputs.btcPrice.trim()!==''&&Number(inputs.btcQuantity)>=0&&Number(inputs.btcPrice)>0&&Number.isFinite(initialValue)?initialValue:undefined;
  function renderField(key:keyof Assumptions){
    const f=fields.find(field=>field.key===key)!;
    const numeric=Number(inputs[key]),year=key==='startYear'||key==='endYear';
    const minimum=year?(chartMode==='powerLaw'?2010:1900):key==='btcReturn'?-100:0;
    const exclusive=key==='btcPrice'||key==='btcReturn';
    const invalid=inputs[key].trim()===''||!Number.isFinite(numeric)||(exclusive?numeric<=minimum:numeric<minimum)||(year&&(!Number.isInteger(numeric)||numeric>2200))||(key==='endYear'&&numeric<Number(inputs.startYear));
    const label=key==='btcReturn'?(chartMode==='monteCarlo'?'BTC 기대 연수익률':'BTC 연 복리 성장률'):f.label;
    const amount=key==='btcPrice'||key==='monthlyBtc';
    const update=(value:string)=>{setInputs(previous=>({...previous,[key]:value}));if(key==='btcPrice'){setAutoPrice(false);setPriceStatus('직접 입력한 BTC 가격을 사용 중입니다.');}};
    return <label key={key}><span>{label}</span><div className={invalid?'input-wrap invalid':'input-wrap'}>{amount?<CurrencyAmountInput label={label} value={inputs[key]} invalid={invalid} disabled={key==='btcPrice'&&priceLoading} onChange={update}/>:<input aria-label={label} type="number" min={minimum} max={year?2200:undefined} step={f.step??'1'} value={inputs[key]} aria-invalid={invalid} onChange={e=>update(e.target.value)}/>}<span>{amount?(display.currency==='USD'?'USD':'원')+(key==='btcPrice'?' / BTC':''):f.unit}</span></div>{invalid?<span className="field-error">입력 범위를 확인해 주세요.</span>:amount&&<span className="field-hint">{display.compact(numeric)}</span>}</label>;

  }
  return <main className="simple-app btc-only">
    <header className="app-header"><div><p className="eyebrow">MY BITCOIN PLAN</p><h1>나의 비트코인 계획</h1><p>보유한 BTC와 매달의 투자로 미래를 살펴보세요.</p></div><div className="app-header-actions"><CurrencyToggle/><span className="app-save" role="status">{saveStatus}</span></div></header>
    <section className="summary" aria-label="BTC 평가액 요약">{[
      ['현재 BTC 평가액',currentValue,inputs.btcQuantity+' BTC 보유'],
      [resultYear+'년 BTC '+(chartMode==='monteCarlo'?'평가액 중앙값':'예상 평가액'),futureValue,chartMode==='monteCarlo'?'Monte Carlo · 100,000회 결과':chartMode==='powerLaw'?'Power Law · β '+powerLawBeta:'CAGR · 입력한 성장률 적용'],
    ].map(([label,value,note])=><article className="card" key={String(label)}><p>{label}</p><strong>{typeof value==='number'?display.compact(value):'계산 대기'}</strong><small>{typeof value==='number'?display.money(value).replace(' KRW','원'):'입력값을 확인해 주세요.'}</small><span>{note}</span></article>)}</section>
    <div className="workspace">
      <section className="card assumptions" aria-labelledby="btc-input-title">
        <p className="eyebrow">01 · 나의 입력</p><h2 id="btc-input-title">BTC와 투자 계획</h2>
        <div className="input-group"><h3>지금 보유한 비트코인</h3><div className="fields">{renderField('btcQuantity')}{renderField('btcPrice')}</div>
          <div className="price-controls"><button type="button" disabled={priceLoading} onClick={()=>void refreshPrice()}>{priceLoading?'가져오는 중…':'BTC 현재가 새로고침'}</button><p className="muted" role="status">{priceStatus}</p></div>
        </div>
        <div className="input-group"><h3>투자와 기간</h3><div className="fields">{renderField('monthlyBtc')}{renderField('endYear')}{(chartMode==='cagr'||(chartMode==='monteCarlo'&&!monteCarloSettings.market.regimeEnabled))&&renderField('btcReturn')}</div>
          {chartMode==='monteCarlo'&&<p className="muted">{monteCarloSettings.market.regimeEnabled?'상승장·하락장의 수익률과 변동성으로 계산합니다.':'기대 연수익률은 1년 단순수익률의 산술평균 가정입니다.'}</p>}
          {chartMode==='powerLaw'&&<div className="power-beta-control"><label><span>Power Law 베타 β</span><div className="input-wrap"><input aria-label="Power Law 베타" type="number" min="0" step="0.1" value={powerLawBeta} onChange={e=>setPowerLawBeta(e.target.value)}/><span>시작 가격을 유지하며 미래 성장 기울기를 조절합니다.</span></div></label></div>}
        </div>
        {chartMode==='monteCarlo'&&<MonteCarloPanel portfolio={inputs} settings={monteCarloSettings} onChange={setMonteCarloSettings}/>}
        <details className="ui-inline-disclosure"><summary>시작 연도와 시세 설정</summary><div className="fields">{renderField('startYear')}</div><div className="price-controls"><label className="check-label"><input type="checkbox" checked={autoPrice} onChange={e=>setAutoPrice(e.target.checked)}/>접속 시 BTC 현재가 가져오기</label></div><button type="button" className="text-button ui-reset" onClick={reset}>기본값으로 되돌리기</button></details>
      </section>
      <section className="card result-card" aria-labelledby="results-title">
        <div className="section-heading"><div><p className="eyebrow">02 · 나의 결과</p><h2 id="results-title">시간에 따른 BTC 평가액</h2></div><span className="unit-pill">{inputs.startYear}–{inputs.endYear}년</span></div>
        <div className="segment" role="group" aria-label="그래프 계산 방식" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}>{([['cagr','CAGR'],['monteCarlo','Monte Carlo'],['powerLaw','Power Law']] as const).map(([mode,label])=><button key={mode} className={chartMode===mode?'active':''} aria-pressed={chartMode===mode} onClick={()=>setChartMode(mode)}>{label}</button>)}</div>
        <p className="muted btc-year-note">연도 기준: 각 연도 1월 1일(연초), UTC 기준입니다.</p>
        {chartMode==='monteCarlo'?<>
          <div className="mc-actions"><button className="mc-run" disabled={mc.busy||!!mc.validation} onClick={mc.run}>{mc.busy?'100,000회 계산 중…':'Monte Carlo 100,000회 실행'}</button>{mc.busy&&<button onClick={mc.cancel}>계산 취소</button>}<span role="status">{mc.busy?mc.progress+'%':mc.completed?'계산 완료':''}</span></div>
          {mc.busy&&<progress value={mc.progress} max={100} aria-label="시뮬레이션 진행률"/>}
          {mc.validation&&<p className="error inline-error" role="alert">{mc.validation}</p>}{mc.error&&<p className="error inline-error" role="alert">{mc.error}</p>}
          {mc.stale&&<p className="mc-notice" role="status">입력값이 변경되었습니다. 아래 결과는 이전 가정의 결과입니다. 다시 실행해 갱신해 주세요.</p>}
          {mc.completed?<><MonteCarloFanChart rows={mc.completed.result.rows}/><MonteCarloResults result={mc.completed.result}/><RunAssumptions request={mc.completed.request}/></>:<p className="empty-chart">{mc.busy?'시뮬레이션을 계산하고 있습니다.':'실행 버튼을 눌러 BTC 평가액 범위를 확인하세요.'}</p>}
        </>:error?<p className="error inline-error" role="alert">{error}</p>:<BtcChart key={chartMode} rows={rows}/>}
        <details className="ui-inline-disclosure"><summary>계산 방식</summary>{chartMode==='powerLaw'?<p className="muted">BTC 가격 = 현재 가격 × (미래 경과일수 / 시작 경과일수)<sup>β</sup>. 경과일수는 2009-01-03부터 각 연도 1월 1일까지입니다. 베타를 바꿔도 시작 가격과 평가액은 유지됩니다. 기본 5.845는 조정 가능한 성장 가정입니다.</p>:chartMode==='cagr'?<p className="muted">BTC 가격은 입력한 연 복리 성장률로 증가합니다. BTC 평가액은 보유 수량 × 해당 연도 BTC 가격입니다.</p>:<p className="muted">BTC 원화 가격의 수익률과 변동성으로 100,000개 경로를 계산합니다. 음영과 중앙값은 입력 가정에 따른 평가액 분포입니다.</p>}<p className="muted">시작 연도에는 투자하지 않습니다. 이후 월 투자금 12개월분을 다음 연도 연초 가격으로 한 번에 매수하는 근사입니다. 표시 금액은 선택한 통화와 최신 조회 환율을 따릅니다. 세금과 수수료는 반영하지 않습니다.</p></details>
      </section>
    </div>
    <footer>입력한 BTC 가정에 따른 시나리오입니다. 설정은 이 브라우저에 저장됩니다.</footer>
  </main>;
}

export function App(props:{initialChartMode?:ChartMode}={}) {return <CurrencyProvider><BitcoinApp {...props}/></CurrencyProvider>;}
