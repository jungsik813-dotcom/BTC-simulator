import { InteractiveChart } from './InteractiveChart';
import { useState } from 'react';
import { calculateValuationComparison, chartScale, defaultVisibleValuations, valuationSeries, type ComparisonInput, type ValuationRow, type VisibleValuations } from './valuationComparison';
import { parsePowerLawInputs, parseTamInputs, formatMoney, compactKrw, type Inputs, type PowerLawInputs, type TamInputs } from './settings';
import { parseOnchainInputs, type OnchainSettings } from './onchainInput';
import { supplyModes } from './onchain';

import { parseTamAdoptionInputs, type TamAdoptionInputs } from './tamAdoptionSettings';

const amount=(value:number|null|undefined)=>value===null||value===undefined?'—':formatMoney(value);
const ratio=(value:number|null|undefined)=>value===null||value===undefined?'계산 불가':`${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:3}).format(value)}×`;
const short=(value:number|null|undefined)=>value===null||value===undefined?'—':compactKrw(value);

function ComparisonChart({rows,visible,logarithmic,selectedYear,onSelect}: {rows:ValuationRow[];visible:VisibleValuations;logarithmic:boolean;selectedYear:number;onSelect:(year:number)=>void}) {
  const active=valuationSeries.filter(series=>visible[series.key]);
  const scale=chartScale(rows.flatMap(row=>active.map(series=>row[series.key])),logarithmic);
  if(!scale)return <p className="empty-chart">표시할 모델을 선택하거나 입력값을 확인해 주세요.</p>;
  const x=(i:number)=>100+i/Math.max(1,rows.length-1)*760;
  const y=(value:number|null)=>{const p=scale.position(value);return p===null?null:25+(1-p)*270;};
  const omitted=logarithmic&&rows.some(row=>active.some(series=>row[series.key]!==null&&row[series.key]!<=0));
  return <>{omitted&&<p className="muted">0 이하의 값은 로그 축에서 표시할 수 없어 생략했습니다. 표에서는 확인할 수 있습니다.</p>}<InteractiveChart width={900} height={340} left={100} right={40} top={20} bottom={38} onSelect={onSelect} label={`Bitcoin Valuation Chart · ${logarithmic?'로그':'선형'} 축 · 연도 클릭으로 상세 확인`} data={rows.map(row=>({year:row.year,entries:active.map(series=>({label:series.label,value:amount(row[series.key]).replace(' KRW','원'),color:series.color,y:y(row[series.key])}))}))}>
    {[0,1,2,3,4].map(i=>{const fraction=i/4,gy=25+(1-fraction)*270;return <g key={i}><line x1="100" x2="860" y1={gy} y2={gy} stroke="#e5e9ee"/><text x="88" y={gy+4} textAnchor="end">{compactKrw(scale.tick(fraction))}</text></g>})}
    {active.map(series=>{let drawing=false;const path=rows.map((row,i)=>{const py=y(row[series.key]);if(py===null){drawing=false;return '';}const command=drawing?'L':'M';drawing=true;return `${command} ${x(i)} ${py}`}).join(' ');return <g key={series.key}><path d={path} stroke={series.color} strokeWidth={series.key==='cagr'||series.key==='tam'||series.key==='fair'?2.6:1.8} strokeDasharray={series.dash} fill="none"/>{rows.map((row,i)=>{const py=y(row[series.key]);return py===null?null:<circle key={row.year} className="valuation-point" cx={x(i)} cy={py} r={selectedYear===row.year?4:2.5} fill={series.color} onClick={()=>onSelect(row.year)}><title>{`${row.year}년 · ${series.label} · ${amount(row[series.key])}`}</title></circle>})}</g>})}
    {rows.map((row,i)=>row.year===selectedYear?<line key={row.year} x1={x(i)} x2={x(i)} y1="20" y2="302" stroke="#8a9890" strokeDasharray="3 5" pointerEvents="none"/>:null)}
    {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y="327" textAnchor="middle">{rows[i].year}</text>)}
  </InteractiveChart></>;
}

export function ValuationComparisonPanel({portfolio,tamInputs,tamAdoptionInputs,powerLawInputs,onchainSettings,priceModel}: {portfolio:Inputs;tamInputs:TamInputs;tamAdoptionInputs:TamAdoptionInputs;powerLawInputs:PowerLawInputs;onchainSettings:OnchainSettings;priceModel:'cagr'|'tam'}) {
  const [visible,setVisible]=useState(defaultVisibleValuations);
  const [logarithmic,setLogarithmic]=useState(false);
  const [preferredYear,setPreferredYear]=useState(2035);
  const errors:string[]=[];
  let rows:ValuationRow[]=[],fatal='';
  const input:ComparisonInput={startYear:Number(portfolio.startYear),endYear:Number(portfolio.endYear),btcPrice:Number(portfolio.btcPrice),btcReturn:Number(portfolio.btcReturn),priceModel,tam:null,power:null,onchain:null,supplyMode:onchainSettings.supplyMode};
  try{input.tamAdoption=parseTamAdoptionInputs(tamAdoptionInputs,input.startYear);input.tam=parseTamInputs(tamInputs);}catch(error){errors.push(`TAM: ${(error as Error).message}`)}
  try{input.power=parsePowerLawInputs(powerLawInputs);}catch(error){errors.push(`Power Law: ${(error as Error).message}`)}
  try{input.onchain=parseOnchainInputs(onchainSettings.inputs,onchainSettings.marketCapSource);}catch(error){errors.push(`온체인: ${(error as Error).message}`)}
  try{
    if(portfolio.startYear.trim()===''||portfolio.endYear.trim()==='')throw new Error('시작·종료 연도를 입력해 주세요.');
    if(portfolio.btcPrice.trim()===''||portfolio.btcReturn.trim()==='')input.btcPrice=NaN;
    const result=calculateValuationComparison(input);rows=result.rows;errors.push(...result.errors);
  }catch(error){fatal=(error as Error).message;}
  const selected=rows.find(row=>row.year===preferredYear)??rows[0];
  const costLabel=onchainSettings.supplyMode==='cointime'?'True Market Mean':'Active Cost Basis · 비교';
  const sourceLabel=priceModel==='tam'?'TAM':'CAGR';
  const modeLabel=supplyModes.find(mode=>mode.key===onchainSettings.supplyMode)?.label??'';
  return <section className="card valuation-comparison" id="valuation-comparison">
    <div className="section-heading"><div><p className="eyebrow">YEAR-BY-YEAR · STEP 6</p><h2>Bitcoin Valuation Chart</h2></div><label className="check-label"><input type="checkbox" checked={logarithmic} onChange={event=>setLogarithmic(event.target.checked)}/>로그 스케일</label></div>
    <p className="muted">CAGR·TAM·Power Law·온체인 기준가를 1년 단위로 비교합니다. 가격은 KRW / BTC이며 모든 모델은 독립적으로 계산합니다.</p>
    <div className="comparison-assumptions"><b>연도별 온체인 비교 가정</b><p>Realized Cap·Thermocap·Liveliness와 미이동 공급 비율은 현재 입력값으로 고정합니다. 공급량은 해당 연도의 발행 근사치로 바꾸며, MVRV·AVIV는 {sourceLabel} 가격을 사용합니다. USD 기준 온체인 값과 Power Law는 고정 환산율 {input.power?`${input.power.usdKrw.toLocaleString('ko-KR')} KRW/USD`:'입력 확인 필요'}로 비교합니다.</p><p>비교 공급 방식: {modeLabel}. 입력한 현물 가격·시가총액 대신 각 연도의 모델 가격 × 공급량을 사용합니다. 기준가는 미래 온체인 데이터의 예측값이 아닙니다.</p></div>
    {fatal?<p className="error inline-error" role="alert">{fatal}</p>:<>
      {errors.length>0&&<div className="error inline-error" role="alert">{[...new Set(errors)].map(message=><p key={message}>{message}</p>)}<small>유효한 모델은 계속 표시하며 계산할 수 없는 값은 —로 표시합니다.</small></div>}
      <div className="chart-toggles">{valuationSeries.map(series=><label className="check-label" key={series.key}><input type="checkbox" checked={visible[series.key]} onChange={event=>setVisible({...visible,[series.key]:event.target.checked})}/><span style={{color:series.color}}>●</span>{series.key==='costBasis'?costLabel:series.label}</label>)}</div>
      <ComparisonChart rows={rows} visible={visible} logarithmic={logarithmic} selectedYear={selected.year} onSelect={setPreferredYear}/>
      <div className="year-controls"><div className="quick-years">{[2030,2035,2040,2045].map(year=><button type="button" key={year} disabled={!rows.some(row=>row.year===year)} className={selected.year===year?'active':''} aria-pressed={selected.year===year} onClick={()=>setPreferredYear(year)}>{year}</button>)}</div><label><span>상세 연도</span><select value={selected.year} onChange={event=>setPreferredYear(Number(event.target.value))}>{rows.map(row=><option key={row.year} value={row.year}>{row.year}년</option>)}</select></label></div>
      <h3 className="subheading">{selected.year}년 모델 상세</h3>
      <div className="year-detail-cards" aria-live="polite">
        <article><h3>TAM</h3><strong>{amount(selected.tam)}</strong><p>현재가에서 목표 침투율까지의 채택 경로</p><dl><dt>채택 진행률</dt><dd>{selected.tamDetail?`${(selected.tamDetail.adoptionProgress*100).toFixed(1)}%`:'—'}</dd><dt>전체 TAM</dt><dd>{short(selected.tamDetail?.totalMarket)}</dd><dt>경쟁 가능 TAM</dt><dd>{short(selected.tamDetail?.addressableMarket)}</dd><dt>BTC 시가총액</dt><dd>{short(selected.tamDetail?.marketCap)}</dd></dl></article>
        <article><h3>Power Law</h3><p>역사적 장기 가격궤도 기반</p><dl><dt>Support</dt><dd>{amount(selected.support)}</dd><dt>Fair</dt><dd>{amount(selected.fair)}</dd><dt>Resistance</dt><dd>{amount(selected.resistance)}</dd><dt>Genesis 경과</dt><dd>{selected.powerDetail?`${selected.powerDetail.days.toLocaleString('ko-KR')}일`:'—'}</dd></dl></article>
        <article><h3>MVRV / AVIV · {sourceLabel}</h3><p>현재 원가 가정을 유지한 연도별 비교</p><dl><dt>Classic MVRV</dt><dd>{ratio(selected.onchain?.classicMvrv)}</dd><dt>AVIV · Cointime</dt><dd>{ratio(selected.onchain?.aviv)}</dd><dt>{costLabel}</dt><dd>{amount(selected.costBasis)}</dd><dt>Spot / 비교 기준가</dt><dd>{ratio(selected.onchain?.comparisonRatio)}</dd></dl></article>
        <article><h3>BTC 시가총액 · {sourceLabel}</h3><strong>{short(selected.selectedMarketCap)}</strong><dl><dt>모델 가격</dt><dd>{amount(selected.selectedPrice)}</dd><dt>연도별 공급량</dt><dd>{selected.supply.toLocaleString('ko-KR',{maximumFractionDigits:4})} BTC</dd><dt>계산식</dt><dd>모델 가격 × 공급량</dd></dl><p>이 공급량은 TAM과 동일한 발행 근사치입니다.</p></article>
      </div>
      <h3 className="subheading">연도별 전체 모델 비교</h3><p className="muted">연도 버튼을 누르면 위 상세 카드가 바뀝니다. 차트에서 숨긴 모델도 표에서는 확인할 수 있습니다.</p>
      <div className="table-scroll"><table className="valuation-table"><thead><tr><th scope="col">연도</th>{valuationSeries.map(series=><th key={series.key} scope="col">{series.key==='costBasis'?costLabel:series.label}<small>KRW / BTC</small></th>)}<th scope="col">BTC Supply<small>BTC</small></th></tr></thead><tbody>{rows.map(row=><tr key={row.year} className={selected.year===row.year?'selected-year':''} onClick={()=>setPreferredYear(row.year)}><th scope="row"><button type="button" aria-pressed={selected.year===row.year} onClick={()=>setPreferredYear(row.year)}>{row.year}</button></th>{valuationSeries.map(series=><td key={series.key}>{row[series.key]===null?'—':row[series.key]!.toLocaleString('ko-KR',{maximumFractionDigits:0})}</td>)}<td>{row.supply.toLocaleString('ko-KR',{maximumFractionDigits:4})}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
