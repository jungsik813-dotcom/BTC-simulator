import { useChartLayout } from './useChartLayout';
import { useCurrency } from './CurrencyProvider';
import { InteractiveChart } from './InteractiveChart';
import { type Inputs } from './settings';
import { MONTE_CARLO_QUANTILES, type MonteCarloRequest, type MonteCarloResult, type MonteCarloYear } from './monteCarlo';
import { type MonteCarloSettings } from './monteCarloSettings';
import { MarketModelInputs, MarketSnapshot } from './MarketModelInputs';
import { REGIMES, REGIME_LABELS } from './marketModel';
import './monteCarlo.css';
import { parseMarketSettings } from './marketSettings';

type NumericKey=keyof MonteCarloSettings['inputs'];
const quantiles=[...MONTE_CARLO_QUANTILES,'mean'] as const;
const labels=['P20','P30','P40','P50 · 중앙값','P60','P70','P80','평균 · 참고'];
const quantileColors={p20:'#986b5c',p30:'#7a8170',p40:'#577b87',p50:'#175442',p60:'#b08b40',p70:'#856c9d',p80:'#615195'};


export function MonteCarloFanChart({rows}:{rows:MonteCarloYear[]}) {
  const display=useCurrency();
  const {ref,width,height,left,right,top,bottom}=useChartLayout(1000,350,110);
  const min=Math.min(0,...rows.map(r=>r.btcValue.p20)),max=Math.max(1,...rows.map(r=>r.btcValue.p80));
  const x=(i:number)=>left+i/Math.max(1,rows.length-1)*(width-left-right);
  const y=(v:number)=>top+(max-v)/(max-min)*(height-top-bottom);
  const points=(key:typeof MONTE_CARLO_QUANTILES[number])=>rows.map((r,i)=>[x(i),y(r.btcValue[key])].join(','));
  const band=(lower:'p20'|'p30',upper:'p80'|'p60')=>[...points(upper),...points(lower).reverse()].join(' ');
  return <div ref={ref} className="responsive-chart"><InteractiveChart width={width} height={height} left={left} right={right} top={top} bottom={bottom} label="BTC 평가액의 연도별 P20·P30·P40·P50·P60·P70·P80" data={rows.map(r=>({year:r.year,entries:MONTE_CARLO_QUANTILES.map(key=>({label:key==='p50'?'P50 · 중앙값':key.toUpperCase(),value:display.money(r.btcValue[key]),color:quantileColors[key],y:y(r.btcValue[key])}))}))}>
    {[0,1,2,3,4].map(i=>{const v=min+(max-min)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#e5e9ee"/><text x={left-12} y={y(v)+4} textAnchor="end">{display.compact(v)}</text></g>})}
    <polygon points={band('p20','p80')} fill="#e8f0eb"/>
    <polygon points={band('p30','p60')} fill="#c9dfd0"/>
    {MONTE_CARLO_QUANTILES.map(key=><g key={key}><polyline points={points(key).join(' ')} fill="none" stroke={quantileColors[key]} strokeWidth={key==='p50'?3:1.7} strokeDasharray={key==='p20'||key==='p80'?'6 4':undefined}/>{rows.map((r,i)=><circle key={r.year} cx={x(i)} cy={y(r.btcValue[key])} r={key==='p50'?3:2} fill={quantileColors[key]}/>)}</g>)}
    {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y={height-12} textAnchor="middle">{rows[i].year}</text>)}
  </InteractiveChart></div>;
}

export function MonteCarloResults({result}:{result:MonteCarloResult}) {
  const display=useCurrency();
  const d=result.diagnostics;
  return <>
    {d&&<details className="ui-inline-disclosure"><summary>계산 상세 정보</summary><p className="muted">전체 {d.pathYears.toLocaleString()}개 경로·연도에서 급락 {d.crashes.toLocaleString()}회, 급등 {d.manias.toLocaleString()}회 · Student-t 손실 하한 적용: BTC {d.btcFloors.toLocaleString()}회. 이벤트 횟수는 최종 BTC 상·하한 적용 전 발생 횟수입니다.</p></details>}
    <div className="mc-legend">{MONTE_CARLO_QUANTILES.map(key=><span key={key}><i style={{background:quantileColors[key],height:3}}/>{key==='p50'?'P50 · 중앙값':key.toUpperCase()}</span>)}</div>
    <p className="muted">각 선은 해당 연도의 BTC 평가액 분위수입니다. P20은 결과의 20%가 그 값 이하라는 뜻입니다. 옅은 음영은 P20~P80의 60% 범위, 진한 음영은 P30~P60의 30% 범위이며 중앙값을 중심으로 대칭인 범위는 아닙니다.</p>
    <details className="ui-inline-disclosure"><summary>연도별 자세한 결과</summary><div className="table-scroll"><table><caption>연도별 BTC 평가액 · {display.currency}</caption><thead><tr><th>연도</th>{labels.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{result.rows.map(row=><tr key={row.year}><th>{row.year}</th>{quantiles.map(q=><td key={q} className={q==='p50'?'mc-median-cell':undefined}>{display.money(row.btcValue[q])}</td>)}</tr>)}</tbody></table></div></details>
    {result.rows.some(r=>r.regimeCounts)&&<details className="mc-snapshot"><summary>연도별 시장 국면 비율</summary><p className="muted">각 연도에 실제로 추출된 경로 비율입니다. 시작 연도에는 투자 수익률을 적용하지 않습니다.</p><div className="table-scroll"><table><thead><tr><th>연도</th>{REGIMES.map(r=><th key={r}>{REGIME_LABELS[r]}</th>)}</tr></thead><tbody>{result.rows.filter(r=>r.regimeCounts).map(row=><tr key={row.year}><th>{row.year}</th>{REGIMES.map(r=><td key={r}>{(row.regimeCounts![r]/result.paths*100).toFixed(2)}%</td>)}</tr>)}</tbody></table></div></details>}
  </>;
}

export function RunAssumptions({request}:{request:MonteCarloRequest}) {
  const display=useCurrency();
  const {portfolio:p,assumptions:a}=request;
  return <details className="mc-snapshot"><summary>이 결과에 사용한 가정</summary><ul className="notes">
    <li>{p.startYear}~{p.endYear}년 · {a.paths.toLocaleString()}회 · seed {a.seed}</li>
    <li>초기 BTC {p.btcQuantity}개 × {display.money(p.btcPrice)} · 월 투자금 {display.money(p.monthlyBtc)}</li>
    {!request.market?.regimeEnabled&&<li>BTC 기대 연수익률 {a.btcMean}% · 변동성 {a.btcVolatility}%</li>}<li>수익률 제한 {a.limitBtcReturns?a.minBtcReturn+'% ~ '+a.maxBtcReturn+'%':'없음'}</li>
    {request.market?.regimeEnabled&&<li>국면별 수익률과 변동성을 적용합니다.</li>}
  </ul>{request.market&&<MarketSnapshot market={request.market}/>}</details>;
}

export function MonteCarloPanel({portfolio,settings,onChange}:{portfolio:Inputs;settings:MonteCarloSettings;onChange:(settings:MonteCarloSettings)=>void}) {
  let issue='';
  try{parseMarketSettings(settings.market)}catch(e){issue=(e as Error).message}
  function input(key:NumericKey,label:string,unit='%',disabled=false){return <label key={key}><span>{label}</span><div className="input-wrap"><input aria-label={label} type="number" step={key==='seed'?'1':'any'} value={settings.inputs[key]} disabled={disabled} onChange={e=>onChange({...settings,inputs:{...settings.inputs,[key]:e.target.value}})}/><span>{unit}</span></div></label>}
  return <div className="mc-panel">
    {!settings.market.regimeEnabled&&<div className="fields">{input('btcVolatility',settings.market.distribution==='studentT'?'BTC 수익률 변동성':'BTC 연 로그수익률 변동성')}</div>}
    {settings.market.regimeEnabled&&<div className="regime-default-summary">{REGIMES.map(r=><p key={r}><b>{REGIME_LABELS[r]}</b><span>수익률 중심 {settings.market.regimes[r].btcMean}% · 변동성 {settings.market.regimes[r].btcVolatility}%</span></p>)}</div>}
    <details className="ui-inline-disclosure" open={issue?true:undefined}><summary>Monte Carlo 고급 설정</summary>
      <div className="fields">{input('seed','난수 seed','정수')}</div>
      <p className="muted">같은 가정과 seed로 실행하면 같은 결과가 나옵니다.</p>
      <label className="check-label"><input type="checkbox" checked={settings.limitBtcReturns} onChange={e=>onChange({...settings,limitBtcReturns:e.target.checked})}/>BTC 연수익률 상·하한 적용</label>
      {settings.limitBtcReturns&&<div className="fields">{input('minBtcReturn','수익률 하한')}{input('maxBtcReturn','수익률 상한')}</div>}
      <details className="ui-inline-disclosure" open={issue?true:undefined}><summary>BTC 시장 움직임 설정</summary><MarketModelInputs settings={settings.market} onChange={market=>onChange({...settings,market})}/></details>
      <details className="mc-method"><summary>분포와 수익률의 의미</summary><p className="muted">로그정규 모형은 평균 성장배율 × exp(−σ²/2 + σZ)로 계산합니다. 기대 연수익률은 단순수익률의 산술평균이며 변동성은 로그수익률 표준편차입니다. CAGR의 복리 성장률과는 의미가 다릅니다.</p><p className="muted">Student-t는 분산을 1로 맞춘 단순수익률 충격을 사용하고 기본 손실을 −99.9%에서 제한합니다. Jump는 로그정규 모형에서 연간 여러 사건을 합산합니다. 총 로그수익률 평균·분산에서 사건 성분을 빼 일반 변동과 중복 반영하지 않습니다. 수익률 상·하한은 마지막에 적용합니다. 국면·손실 하한·Jump·수익률 제한으로 실제 평균이 입력 가정과 달라질 수 있습니다.</p></details>
    </details>
  </div>;
}
