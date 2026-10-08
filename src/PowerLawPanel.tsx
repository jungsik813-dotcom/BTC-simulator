import { InteractiveChart } from './InteractiveChart';
import { useState } from 'react';
import { calculateTamRange, type TamYearResult } from './tam';
import { calculatePowerLawRange, POWER_LAW_SOURCE, type PowerLawYearResult } from './powerLaw';
import { defaultPowerLawInputs, formatMoney, parsePowerLawInputs, parseTamInputs, type Inputs, type PowerLawInputs, type TamInputs } from './settings';

import { parseTamAdoptionInputs, type TamAdoptionInputs } from './tamAdoptionSettings';

const fields: { key: keyof PowerLawInputs; label: string; unit: string; min?: number; max?: number }[] = [
  {key:'exponent',label:'지수 β',unit:'일 기준 지수',min:0},
  {key:'log10Intercept',label:'절편 log₁₀(A)',unit:'USD 기준'},
  {key:'supportMultiplier',label:'지지 배수',unit:'× 기준선',min:0,max:1},
  {key:'resistanceMultiplier',label:'저항 배수',unit:'× 기준선',min:1},
  {key:'usdKrw',label:'고정 USD/KRW 환산율',unit:'KRW / USD',min:0},
];
const lines = [
  {key:'tam',label:'TAM',color:'#246957',dash:undefined},
  {key:'support',label:'Power Law Support',color:'#57769c',dash:'4 4'},
  {key:'fair',label:'Power Law Fair',color:'#57769c',dash:undefined},
  {key:'resistance',label:'Power Law Resistance',color:'#57769c',dash:'9 5'},
] as const;
type LineKey = typeof lines[number]['key'];
type PriceRow = { year:number } & Partial<Record<LineKey,number>>;

function PriceChart({rows,visible}: {rows:PriceRow[];visible:Record<LineKey,boolean>}) {
  const active=lines.filter(line=>visible[line.key]&&rows.some(row=>row[line.key]!==undefined));
  if (!active.length) return <p className="empty-chart">표시할 가격선을 선택하거나 입력값을 확인해 주세요.</p>;
  const maximum=Math.max(1,...rows.flatMap(row=>active.map(line=>row[line.key]??0)));
  const x=(i:number)=>90+i/Math.max(1,rows.length-1)*780;
  const y=(v:number)=>25+(1-v/maximum)*240;
  return <InteractiveChart width={900} height={310} left={90} right={30} top={25} bottom={45} label={`BTC 원화 가격 비교: ${active.map(line=>line.label).join(', ')}`} data={rows.map(row=>({year:row.year,entries:active.filter(line=>row[line.key]!==undefined).map(line=>({label:line.label,value:formatMoney(row[line.key]!).replace(' KRW','원'),color:line.color,y:y(row[line.key]!)}))}))}>
    {[0,1,2,3,4].map(i=>{const value=maximum*i/4;return <g key={i}><line x1="90" x2="870" y1={y(value)} y2={y(value)} stroke="#e5e9ee"/><text x="78" y={y(value)+4} textAnchor="end">{new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value/1e8)}억</text></g>})}
    {active.map(line=><g key={line.key}><polyline fill="none" stroke={line.color} strokeWidth={line.key==='tam'||line.key==='fair'?3:2} strokeDasharray={line.dash} points={rows.flatMap((row,i)=>row[line.key]===undefined?[]:[`${x(i)},${y(row[line.key]!)}`]).join(' ')}/>{rows.map((row,i)=>row[line.key]===undefined?null:<circle key={row.year} cx={x(i)} cy={y(row[line.key]!)} r="3" fill={line.color}><title>{row.year}년 · {line.label} · {formatMoney(row[line.key]!)}</title></circle>)}</g>)}
    {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y="298" textAnchor="middle">{rows[i].year}</text>)}
  </InteractiveChart>;
}

export function PowerLawPanel({portfolio,tamInputs,tamAdoptionInputs,inputs,onChange,showComparison=true}: {portfolio:Inputs;tamInputs:TamInputs;tamAdoptionInputs:TamAdoptionInputs;inputs:PowerLawInputs;onChange:(value:PowerLawInputs)=>void;showComparison?:boolean}) {
  const [visible,setVisible]=useState<Record<LineKey,boolean>>({tam:true,support:true,fair:true,resistance:true});
  let powerRows:PowerLawYearResult[]=[],tamRows:TamYearResult[]=[],powerError='',tamError='';
  const start=Number(portfolio.startYear),end=Number(portfolio.endYear);
  try { powerRows=calculatePowerLawRange(start,end,parsePowerLawInputs(inputs)); } catch(error) { powerError=(error as Error).message; }
  try { tamRows=calculateTamRange(start,end,parseTamInputs(tamInputs),{initialPrice:Number(portfolio.btcPrice),adoption:parseTamAdoptionInputs(tamAdoptionInputs,start)}); } catch(error) { tamError=(error as Error).message; }
  const years=powerRows.length?powerRows.map(row=>row.year):tamRows.map(row=>row.year);
  const powerByYear=new Map(powerRows.map(row=>[row.year,row]));
  const tamByYear=new Map(tamRows.map(row=>[row.year,row]));
  const chartRows:PriceRow[]=years.map(year=>({year,tam:tamByYear.get(year)?.btcPrice,support:powerByYear.get(year)?.support,fair:powerByYear.get(year)?.fair,resistance:powerByYear.get(year)?.resistance}));
  const last=powerRows.at(-1);
  return <section className="card power-law-panel">
    <div className="section-heading"><div><p className="eyebrow">HISTORICAL BENCHMARK</p><h2>Bitcoin Power Law</h2></div><button type="button" className="text-button" onClick={()=>onChange(defaultPowerLawInputs())}>기본 preset 적용</button></div>
    <p className="muted">역사적 장기 가격궤도 기반 참고 모델입니다. 포트폴리오에는 선택한 CAGR 또는 TAM을 적용하며, Power Law와 TAM을 평균내지 않습니다.</p>
    <div className="power-fields">{fields.map(field=>{const value=inputs[field.key],number=Number(value);const exclusive=field.key==='exponent'||field.key==='supportMultiplier'||field.key==='usdKrw';const invalid=value.trim()===''||!Number.isFinite(number)||(field.min!==undefined&&(exclusive?number<=field.min:number<field.min))||(field.max!==undefined&&number>field.max);return <label key={field.key}><span>{field.label}</span><div className={`input-wrap ${invalid?'invalid':''}`}><input type="number" step="any" min={field.min} max={field.max} value={value} aria-invalid={invalid} onChange={event=>onChange({...inputs,[field.key]:event.target.value})}/><span>{field.unit}</span></div>{invalid&&<span className="field-error">입력 범위를 확인해 주세요.</span>}</label>})}</div>
    <div className="formula">Price(USD) = 10<sup>절편</sup> × t<sup>β</sup> · t = 2009-01-03부터 각 연도 12-31 UTC까지 경과한 일수</div>
    <p className="muted power-note">원화 비교값 = USD 기준값 × 고정 환산율. 환산율은 현재 시세가 아닌 사용자의 가정이며 모든 연도에 동일하게 적용합니다.</p>
    <p className="muted">기본 지수·절편은 <a href={POWER_LAW_SOURCE} target="_blank" rel="noreferrer">Burger의 2019년 회귀식</a>을 참고했습니다. 2009-01-03 기준으로 적용하며, 지지 0.5×·저항 2× 배수는 수정 가능한 예시입니다.</p>
    {powerError&&<p className="error inline-error" role="alert">{powerError}</p>}
    {last&&<div className="tam-metrics power-metrics">{[['Support',last.support,last.supportUsd],['Fair',last.fair,last.fairUsd],['Resistance',last.resistance,last.resistanceUsd]].map(([label,krw,usd])=><div key={String(label)}><span>{last.year} Power Law {label}</span><strong>{formatMoney(Number(krw))}</strong><small>{formatMoney(Number(usd),'USD')}</small></div>)}</div>}
    <div className="model-explanations"><p><b>TAM</b> 경제적 시장점유율 기반</p><p><b>Power Law</b> 역사적 장기 가격궤도 기반</p></div>
    {showComparison&&<><h3 className="subheading">BTC 가격 비교</h3><p className="muted">단위: KRW / BTC · 기본 범위 2026~2045 · 각 선은 독립적으로 계산됩니다.</p>
    {tamError&&<p className="error inline-error" role="alert">TAM 비교: {tamError}</p>}
    <div className="chart-toggles">{lines.map(line=><label className="check-label" key={line.key}><input type="checkbox" checked={visible[line.key]} onChange={event=>setVisible({...visible,[line.key]:event.target.checked})}/><span style={{color:line.color}}>●</span>{line.label}</label>)}</div>
    <PriceChart rows={chartRows} visible={visible}/></>}
  </section>;
}
