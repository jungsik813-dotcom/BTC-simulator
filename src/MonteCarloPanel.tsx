import { InteractiveChart } from './InteractiveChart';
import { useEffect, useRef, useState } from 'react';
import { compactKrw, formatMoney, parseInputs, parseTamInputs, type Inputs, type TamInputs } from './settings';
import { validateMonteCarloRequest, type MonteCarloMessage, type MonteCarloRequest, type MonteCarloResult, type MonteCarloYear } from './monteCarlo';
import { makeMonteCarloRequest, type MonteCarloSettings } from './monteCarloSettings';
import { MarketModelInputs, MarketSnapshot } from './MarketModelInputs';
import { REGIMES, REGIME_LABELS } from './marketModel';
import { parseTamAdoptionInputs, type TamAdoptionInputs } from './tamAdoptionSettings';
import './monteCarlo.css';
import { parseMarketSettings } from './marketSettings';

type Metric='nominal'|'real';
type NumericKey=keyof MonteCarloSettings['inputs'];
const quantiles=['p10','p25','p50','p75','p90','mean'] as const;
const labels=['P10','P25','P50 · 중앙값','P75','P90','평균 · 참고'];

export function MonteCarloFanChart({rows,metric}:{rows:MonteCarloYear[];metric:Metric}) {
  const width=1000,height=350,left=110,right=25,top=25,bottom=45;
  const min=Math.min(0,...rows.map(r=>r[metric].p10)),max=Math.max(1,...rows.map(r=>r[metric].p90));
  const x=(i:number)=>left+i/Math.max(1,rows.length-1)*(width-left-right);
  const y=(v:number)=>top+(max-v)/(max-min)*(height-top-bottom);
  const points=(key:typeof quantiles[number])=>rows.map((r,i)=>`${x(i)},${y(r[metric][key])}`);
  const band=(lower:'p10'|'p25',upper:'p90'|'p75')=>[...points(upper),...points(lower).reverse()].join(' ');
  return <InteractiveChart width={width} height={height} left={left} right={right} top={top} bottom={bottom} label={`${metric==='nominal'?'명목':'실질'} 순자산의 연도별 P10~P90 분포와 중앙값`} data={rows.map(r=>({year:r.year,entries:(['p10','p25','p50','p75','p90'] as const).map((key,i)=>({label:['낮은 쪽 · P10','P25','중앙값 · P50','P75','높은 쪽 · P90'][i],value:formatMoney(r[metric][key]).replace(' KRW','원'),color:key==='p50'?'#175442':'#9dc5b5',y:y(r[metric][key])}))}))}>
    {[0,1,2,3,4].map(i=>{const v=min+(max-min)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#e5e9ee"/><text x={left-12} y={y(v)+4} textAnchor="end">{compactKrw(v)}</text></g>})}
    <polygon points={band('p10','p90')} fill="#ddebe6"/>
    <polygon points={band('p25','p75')} fill="#9dc5b5"/>
    <polyline points={points('p50').join(' ')} fill="none" stroke="#175442" strokeWidth="3"/>
    {rows.map((r,i)=><g key={r.year}>{rows.length===1&&<line x1={x(i)} x2={x(i)} y1={y(r[metric].p10)} y2={y(r[metric].p90)} stroke="#9dc5b5" strokeWidth="8"/>}<circle cx={x(i)} cy={y(r[metric].p50)} r="3" fill="#175442"><title>{`${r.year}년 중앙값: ${formatMoney(r[metric].p50)}`}</title></circle></g>)}
    {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y={height-12} textAnchor="middle">{rows[i].year}</text>)}
  </InteractiveChart>;
}

export function MonteCarloResults({result,metric}:{result:MonteCarloResult;metric:Metric}) {
  const last=result.rows.at(-1)!;
  const d=result.diagnostics;
  return <>
    {d&&<details className="ui-inline-disclosure"><summary>계산 상세 정보</summary><p className="muted">전체 {d.pathYears.toLocaleString()}개 경로·연도에서 급락 {d.crashes.toLocaleString()}회, 급등 {d.manias.toLocaleString()}회 · Student-t 손실 하한 적용: BTC {d.btcFloors.toLocaleString()}회, QQQ {d.stockFloors.toLocaleString()}회. 이벤트 횟수는 최종 BTC 상·하한 적용 전 발생 횟수입니다.</p></details>}
    <div className="mc-summary">{(['p10','p50','p90'] as const).map((q,i)=><article key={q} className={q==='p50'?'mc-median':''}><span>{last.year}년 · {['낮은 쪽 결과','중앙값','높은 쪽 결과'][i]}</span><strong>{compactKrw(last[metric][q])}</strong><small>{formatMoney(last[metric][q])}</small></article>)}</div>
    <div className="mc-legend"><span><i className="mc-outer"/>가운데 80%의 결과</span><span><i className="mc-inner"/>가운데 50%의 결과</span><span><i className="mc-line"/>중앙값</span></div>
    <MonteCarloFanChart rows={result.rows} metric={metric}/>
    <p className="muted">음영은 각 연도의 순자산 분포입니다. 하나의 투자 경로나 실제 결과의 보장 범위를 뜻하지 않습니다. P10은 결과의 10%가 그 값 이하라는 의미입니다.</p>
    <details className="ui-inline-disclosure"><summary>연도별 자세한 결과</summary><div className="table-scroll"><table><caption>연도별 {metric==='nominal'?'명목':'실질'} 순자산 · KRW</caption><thead><tr><th>연도</th>{labels.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{result.rows.map(row=><tr key={row.year}><th>{row.year}</th>{quantiles.map(q=><td key={q} className={q==='p50'?'mc-median-cell':undefined}>{formatMoney(row[metric][q])}</td>)}</tr>)}</tbody></table></div></details>
    {result.rows.some(r=>r.regimeCounts)&&<details className="mc-snapshot"><summary>연도별 시장 국면 비율</summary><p className="muted">각 연도에 실제로 추출된 경로 비율입니다. 시작 연도에는 투자 수익률을 적용하지 않습니다.</p><div className="table-scroll"><table><thead><tr><th>연도</th>{REGIMES.map(r=><th key={r}>{REGIME_LABELS[r]}</th>)}</tr></thead><tbody>{result.rows.filter(r=>r.regimeCounts).map(row=><tr key={row.year}><th>{row.year}</th>{REGIMES.map(r=><td key={r}>{(row.regimeCounts![r]/result.paths*100).toFixed(2)}%</td>)}</tr>)}</tbody></table></div></details>}
  </>;
}

function RunAssumptions({request}:{request:MonteCarloRequest}) {
  const {portfolio:p,assumptions:a}=request;
  return <details className="mc-snapshot"><summary>이 결과에 사용한 가정</summary><ul className="notes">
    <li>{p.startYear}~{p.endYear}년 · {a.paths.toLocaleString()}회 · seed {a.seed}</li>
    <li>초기 BTC {p.btcQuantity}개 × {formatMoney(p.btcPrice)}, 주식 {formatMoney(p.stocks)}, 현금 {formatMoney(p.cash)}, 부채 {formatMoney(p.debt)}</li>
    <li>월 납입 BTC {formatMoney(p.monthlyBtc)}, QQQ {formatMoney(p.monthlyStocks)} · 부채 연이율 {p.debtRate}%</li>
    {request.market?.regimeEnabled&&<li>국면 사용 시 아래 기본 BTC·QQQ 수익률/변동성 대신 국면별 가정을 적용합니다.</li>}
    <li>BTC 중심: {a.btcCenter==='tam'?'TAM 연도별 가격':'기대수익률 '+a.btcMean+'%'} · 변동성 {a.btcVolatility}% · USD 수익률 제한 {a.limitBtcReturns?`${a.minBtcReturn}% ~ ${a.maxBtcReturn}%`:'없음'}</li>
    <li>QQQ 기대수익률 {a.stockMean}% · 변동성 {a.stockVolatility}%</li>
    <li>물가상승률 평균 {a.inflationMean}% · 변동성 {a.inflationVolatility}% · USD/KRW 평균 {a.fxMean} · 변동성 {a.fxVolatility}%</li>
  </ul>{request.tamAdoption&&<p>TAM 채택: {request.tamAdoption.curve==='sCurve'?'S곡선':'선형'} · 목표 {request.tamAdoption.targetYear}년 · 가속 중심 {request.tamAdoption.midpointYear}년 · 강도 {request.tamAdoption.steepness}</p>}{request.market&&<MarketSnapshot market={request.market}/>}{request.btcCentersKrw&&<p className="muted">BTC 중심 가격(KRW): {request.btcCentersKrw.map((price,i)=>`${p.startYear+i}년 ${formatMoney(price)}`).join(' / ')}</p>}</details>;
}

export function MonteCarloPanel({portfolio,tamInputs,tamAdoptionInputs,settings,onChange}:{portfolio:Inputs;tamInputs:TamInputs;tamAdoptionInputs:TamAdoptionInputs;settings:MonteCarloSettings;onChange:(settings:MonteCarloSettings)=>void}) {
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const [completed,setCompleted]=useState<{result:MonteCarloResult;request:MonteCarloRequest}|null>(null);
  const [metric,setMetric]=useState<Metric>('nominal');
  const workerRef=useRef<Worker|null>(null);
  useEffect(()=>()=>{workerRef.current?.terminate()},[]);
  let current:MonteCarloRequest|undefined,validation='';
  try{current=makeMonteCarloRequest(parseInputs(portfolio),settings,settings.btcCenter==='tam'?parseTamInputs(tamInputs):undefined,settings.btcCenter==='tam'?parseTamAdoptionInputs(tamAdoptionInputs,Number(portfolio.startYear)):undefined);validateMonteCarloRequest(current)}catch(e){validation=(e as Error).message}
  const stale=completed&&JSON.stringify(current)!==JSON.stringify(completed.request);
  let marketIssue='';
  try{parseMarketSettings(settings.market)}catch(e){marketIssue=(e as Error).message}
  function run(){
    if(!current||validation)return;
    const request=current;
    workerRef.current?.terminate();setError('');setProgress(0);setBusy(true);
    try{
      const worker=new Worker(new URL('./monteCarlo.worker.ts',import.meta.url),{type:'module'});
      workerRef.current=worker;
      const finish=()=>{worker.terminate();workerRef.current=null;setBusy(false)};
      worker.onmessage=(event:MessageEvent<MonteCarloMessage>)=>{
        if(workerRef.current!==worker)return;
        const message=event.data;
        if(message.type==='progress')setProgress(message.percent);
        else if(message.type==='result'){setCompleted({result:message.result,request});setProgress(100);finish()}
        else{setError(message.message);finish()}
      };
      worker.onerror=()=>{if(workerRef.current!==worker)return;setError('계산 작업을 실행하지 못했습니다. 새로고침 후 다시 실행해 주세요.');finish()};
      worker.postMessage(request);
    }catch{workerRef.current?.terminate();workerRef.current=null;setBusy(false);setError('이 브라우저에서 별도 계산 작업을 시작하지 못했습니다.')}
  }
  function cancel(){workerRef.current?.terminate();workerRef.current=null;setBusy(false);setError('계산을 취소했습니다. 이전 완료 결과가 있다면 아래에 유지됩니다.')}
  function input(key:NumericKey,label:string,unit='%',disabled=false){return <label key={key}><span>{label}</span><div className="input-wrap"><input type="number" step={key==='seed'?'1':'any'} value={settings.inputs[key]} disabled={disabled} onChange={e=>onChange({...settings,inputs:{...settings.inputs,[key]:e.target.value}})}/><span>{unit}</span></div></label>}
  return <section className="card mc-panel">
    <div className="section-heading"><div><p className="eyebrow">MONTE CARLO · STEP 8</p><h2>변동성을 반영한 미래 범위</h2></div><span className="unit-pill">선택 시뮬레이션</span></div>
    <p className="muted">위에서 입력한 자산과 투자금에 여러 변동 경로를 적용합니다. 수익률·물가 등은 여기에 별도로 저장된 가정을 사용합니다.</p>
    <p className="mc-active-assumptions">현재 시뮬레이션 가정: BTC {settings.market.regimeEnabled?'시장 국면별 수익률':settings.btcCenter==='tam'?'시장 채택 경로':settings.inputs.btcMean+'%'} · 주식 {settings.market.regimeEnabled?'시장 국면별 수익률':settings.inputs.stockMean+'%'} · 물가 {settings.inputs.inflationMean}%</p>
    <details className="ui-inline-disclosure" open={validation?true:undefined}><summary>시뮬레이션 가정 수정</summary>
    <div className="mc-input-grid">
      <fieldset><legend>실행 설정</legend><label><span>시뮬레이션 횟수</span><select value={settings.inputs.paths} onChange={e=>onChange({...settings,inputs:{...settings.inputs,paths:e.target.value}})}>{[1000,10000,100000].map(n=><option key={n} value={n}>{n.toLocaleString()}회</option>)}</select></label>{input('seed','난수 seed','정수')}<p className="muted">같은 가정과 seed로 실행하면 같은 결과가 나옵니다.</p></fieldset>
      <fieldset><legend>BTC</legend><label><span>중심 경로</span><select value={settings.btcCenter} onChange={e=>onChange({...settings,btcCenter:e.target.value as 'return'|'tam'})}><option value="return">입력 기대수익률</option><option value="tam">TAM 연도별 가격</option></select></label>{input('btcMean',settings.market.distribution==='studentT'?'USD 수익률 중심 · 절단 전':'USD 연 기대수익률','%',settings.btcCenter==='tam'||settings.market.regimeEnabled)}{input('btcVolatility',settings.market.distribution==='studentT'?'단순수익률 변동성':'연 로그수익률 변동성','%',settings.market.regimeEnabled)}<label className="check-label"><input type="checkbox" checked={settings.limitBtcReturns} onChange={e=>onChange({...settings,limitBtcReturns:e.target.checked})}/>USD 연 수익률 상·하한 적용</label>{settings.limitBtcReturns&&<>{input('minBtcReturn','수익률 하한')}{input('maxBtcReturn','수익률 상한')}</>}</fieldset>
      <fieldset><legend>QQQ</legend>{input('stockMean',settings.market.distribution==='studentT'?'USD 수익률 중심 · 절단 전':'USD 연 기대수익률','%',settings.market.regimeEnabled)}{input('stockVolatility',settings.market.distribution==='studentT'?'단순수익률 변동성':'연 로그수익률 변동성','%',settings.market.regimeEnabled)}<p className="muted">초기 주식과 매년 추가 납입액을 환율로 USD로 환산해 투자합니다.</p></fieldset>
      <fieldset><legend>물가 · 환율</legend>{input('inflationMean','연 평균 물가상승률')}{input('inflationVolatility','물가배율 로그 변동성')}{input('fxMean','USD/KRW 평균','KRW/USD')}{input('fxVolatility','환율 수준 로그 변동성')}</fieldset>
    </div>
    <details className="ui-inline-disclosure" open={marketIssue?true:undefined}><summary>시장 움직임 고급 설정</summary><MarketModelInputs settings={settings.market} onChange={market=>onChange({...settings,market})} usesTam={settings.btcCenter==='tam'}/></details>
    <details className="mc-method"><summary>계산 방식과 가정</summary><ul className="notes"><li>Normal 모형의 기대수익률은 연간 단순수익률의 산술 평균이며 변동성은 로그수익률 표준편차입니다. 국면 사용 시 BTC·QQQ 충격에 해당 국면의 상관계수를 적용합니다. 물가·환율 충격은 자산 충격과 독립입니다.</li><li>Normal 성장배율 = (1 + 평균수익률) × exp(−σ²/2 + σZ). Student-t 성장배율 = max(0.001, 1 + 수익률 중심 + σT), T는 분산을 1로 표준화한 Student-t 충격입니다. 물가·환율은 기존 로그정규식을 사용합니다. Jump는 BTC 배율에 곱한 뒤 선택적 상·하한을 적용합니다.</li><li>환율은 매년 입력 평균 주변에서 로그정규 수준을 새로 추출합니다. 시작 환율은 입력 평균이며, 전년 환율에 수익률을 누적하지 않습니다. BTC와 QQQ에는 같은 환율을 적용합니다.</li><li>TAM은 현재가에 고정한 출발점에서 설정한 채택 곡선으로 목표 침투율까지 이어집니다. 환율 평균으로 USD 중심을 환산하며, 상·하한 적용 시 평균과 TAM 중심에서 벗어날 수 있습니다.</li><li>월 납입액 12개월분을 연말에 투자합니다. 현금·부채·납입금은 KRW이며 납입금은 외부 소득입니다. 실질 순자산은 각 경로의 누적 물가로 나눕니다.</li><li>세금·수수료·배당의 별도 현금흐름은 반영하지 않습니다. Student-t 하한·Jump·수익률 제한과 국면 전환으로 장기 결과의 평균은 입력 기대수익률이나 TAM 중심에서 달라질 수 있습니다.</li></ul></details>
    </details>
    {validation&&<p className="error" role="alert">{validation}</p>}
    <div className="mc-actions"><button type="button" className="mc-run" onClick={run} disabled={busy||!!validation}>{busy?'계산 중…':'가능성 계산하기'}</button>{busy&&<button type="button" onClick={cancel}>계산 취소</button>}<span role="status" aria-live="polite">{busy?`${progress}% · 실행 시점의 가정으로 계산 중`:completed?'계산 완료':'가정을 확인한 후 실행하세요.'}</span></div>
    {busy&&<progress value={progress} max={100} aria-label="시뮬레이션 진행률"/>}
    {error&&<p className="error" role="alert">{error}</p>}
    {completed&&<div className="mc-results">{busy&&<p className="mc-notice">아래는 이전에 완료한 실행 결과입니다.</p>}{stale&&<p className="mc-notice" role="status">입력값이 변경되었습니다. 아래는 이전 가정의 결과이며 다시 실행하면 갱신됩니다.</p>}<div className="section-heading"><h3>예상 순자산 범위 · {metric==='nominal'?'명목':'실질'} KRW</h3><div className="segment" role="group" aria-label="Monte Carlo 순자산 기준"><button aria-pressed={metric==='nominal'} className={metric==='nominal'?'active':''} onClick={()=>setMetric('nominal')}>명목</button><button aria-pressed={metric==='real'} className={metric==='real'?'active':''} onClick={()=>setMetric('real')}>실질 · {completed.request.portfolio.startYear}년 구매력</button></div></div><MonteCarloResults result={completed.result} metric={metric}/><RunAssumptions request={completed.request}/></div>}
  </section>;
}
