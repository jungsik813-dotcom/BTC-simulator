import { InteractiveChart } from './InteractiveChart';
import { useState } from 'react';
import { TAM_ASSETS, calculateTamRange, calculateTamYear, type TamYearResult } from './tam';
import { parseTamAdoptionInputs, type TamAdoptionInputs } from './tamAdoptionSettings';
import { compactKrw, formatMoney, parseTamInputs, type Inputs, type TamInputs } from './settings';
import './tamAdoption.css';

const fields=[{key:'marketSizeTrillionKrw',label:'현재 시장 규모',unit:'조 원'},{key:'growthRate',label:'연간 시장 성장률',unit:'%'},{key:'competingShare',label:'BTC 경쟁 가능 비율',unit:'%'},{key:'penetration',label:'목표 연도 침투율',unit:'%'}] as const;
const trillion=(n:number)=>`${(n/1e12).toLocaleString('ko-KR',{maximumFractionDigits:2})}조 원`;
const percent=(n:number)=>`${n.toLocaleString('ko-KR',{maximumFractionDigits:3})}%`;

export function TamPathChart({rows,progress=false,showTarget=false}:{rows:TamYearResult[];progress?:boolean;showTarget?:boolean}) {
  const x=(i:number)=>110+i/Math.max(1,rows.length-1)*755;
  const maximum=progress?100:Math.max(1,...rows.flatMap(r=>showTarget?[r.btcPrice,r.targetBtcPrice]:[r.btcPrice]));
  const y=(v:number)=>25+(1-v/maximum)*245;
  const value=(r:TamYearResult)=>progress?r.adoptionProgress*100:r.btcPrice;
  return <InteractiveChart width={900} height={315} left={110} right={35} top={25} bottom={45} label={progress?'시간에 따른 목표 침투율 전환 진행률':'현재가에서 시작하는 TAM 채택 가격 경로'} data={rows.map(r=>({year:r.year,entries:[{label:progress?'채택 진행률':'채택 반영 가격',value:progress?percent(value(r)):formatMoney(value(r)).replace(' KRW','원'),color:'#246957',y:y(value(r))},...(!progress&&showTarget?[{label:'즉시 적용 참고 가격',value:formatMoney(r.targetBtcPrice).replace(' KRW','원'),color:'#97a49c',y:y(r.targetBtcPrice)}]:[])]}))}>
    {[0,1,2,3,4].map(i=><g key={i}><line x1="110" x2="865" y1={y(maximum*i/4)} y2={y(maximum*i/4)} stroke="#e2e8e4"/><text x="100" y={y(maximum*i/4)+4} textAnchor="end">{progress?`${i*25}%`:compactKrw(maximum*i/4)}</text></g>)}
    {!progress&&showTarget&&<polyline points={rows.map((r,i)=>`${x(i)},${y(r.targetBtcPrice)}`).join(' ')} stroke="#97a49c" strokeDasharray="6 5" strokeWidth="2" fill="none"/>}
    <polyline points={rows.map((r,i)=>`${x(i)},${y(value(r))}`).join(' ')} stroke="#246957" strokeWidth="3" fill="none"/>
    {rows.map((r,i)=><circle key={r.year} cx={x(i)} cy={y(value(r))} r="3" fill="#246957"><title>{`${r.year}년 · ${progress?percent(value(r)):formatMoney(value(r))}`}</title></circle>)}
    {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y="302" textAnchor="middle">{rows[i].year}</text>)}
  </InteractiveChart>;
}

export function TamPanel({portfolio,inputs,adoptionInputs,onChange,onAdoptionChange}:{portfolio:Inputs;inputs:TamInputs;adoptionInputs:TamAdoptionInputs;onChange:(inputs:TamInputs)=>void;onAdoptionChange:(inputs:TamAdoptionInputs)=>void}) {
  const [showTarget,setShowTarget]=useState(false);
  let rows:TamYearResult[]=[],target:TamYearResult|undefined,error='';
  try{
    if([portfolio.startYear,portfolio.endYear,portfolio.btcPrice].some(v=>v.trim()===''))throw new Error('시작·종료 연도와 BTC 현재가를 입력하세요.');
    const start=Number(portfolio.startYear),a=parseTamInputs(inputs),options={initialPrice:Number(portfolio.btcPrice),adoption:parseTamAdoptionInputs(adoptionInputs,start)};
    rows=calculateTamRange(start,Number(portfolio.endYear),a,options);target=calculateTamYear(options.adoption.targetYear,start,a,options);
  }catch(e){error=(e as Error).message}
  const first=rows[0],last=rows.at(-1);
  return <section className="card tam-adoption-panel" id="tam-model">
    <div className="section-heading"><div><p className="eyebrow">BTC VALUATION · ADOPTION OVER TIME</p><h2>TAM · 시간에 따른 채택</h2></div><span className="unit-pill">현재가 → 장기 목표</span></div>
    <p className="muted">현재가는 위 포트폴리오의 BTC 가격으로 고정합니다. 아래 침투율은 지금의 점유율이 아니라 목표 연도의 가정입니다. 기존에 저장한 침투율도 목표값으로 유지됩니다.</p>
    <div className="tam-timing">
      <label><span>채택 곡선</span><select value={adoptionInputs.curve} onChange={e=>onAdoptionChange({...adoptionInputs,curve:e.target.value as TamAdoptionInputs['curve']})}><option value="sCurve">S곡선 · 초기 완만 / 중간 가속 / 후기 둔화</option><option value="linear">선형 · 매년 일정하게 전환</option></select></label>
      {([{key:'targetYear',label:'목표 도달 연도',unit:'년'},{key:'midpointYear',label:'채택 가속 중심 연도',unit:'년'},{key:'steepness',label:'S곡선 강도 · 1~20',unit:'강도'}] as const).map(f=><label key={f.key}><span>{f.label}</span><div className="input-wrap"><input type="number" step={f.key==='targetYear'?'1':'any'} disabled={f.key!=='targetYear'&&adoptionInputs.curve==='linear'} value={adoptionInputs[f.key]} onChange={e=>onAdoptionChange({...adoptionInputs,[f.key]:e.target.value})}/><span>{f.unit}</span></div></label>)}
    </div>
    <p className="muted">목표 연도는 조회 종료 연도와 별개입니다. S곡선 강도를 높이면 가속 중심 부근에 변화가 집중됩니다. 가속 중심은 기울기가 가장 큰 시점이며 항상 50% 도달 연도인 것은 아닙니다.</p>
    <details className="ui-inline-disclosure" open={error?true:undefined}><summary>자산군별 시장 규모와 목표 침투율</summary><div className="tam-grid">{TAM_ASSETS.map(asset=><article className="tam-asset" key={asset.key}><h3>{asset.label}</h3><div className="tam-fields">{fields.map(f=>{const v=inputs[asset.key][f.key],n=Number(v),share=f.key==='competingShare'||f.key==='penetration';const invalid=v.trim()===''||!Number.isFinite(n)||(f.key==='growthRate'?n<=-100:n<0)||(share&&n>100);return <label key={f.key}><span>{f.label}</span><div className={`input-wrap ${invalid?'invalid':''}`}><input type="number" step="any" aria-invalid={invalid} value={v} onChange={e=>onChange({...inputs,[asset.key]:{...inputs[asset.key],[f.key]:e.target.value}})}/><span>{f.unit}</span></div>{invalid&&<span className="field-error">입력 범위를 확인하세요.</span>}</label>})}</div></article>)}</div></details>
    <details className="tam-method"><summary>출발점을 현재가에 맞추는 방법</summary><p>출발 시가총액 = 현재가 × 시작 연도 공급량 근사치. 이를 각 자산의 경쟁 가능 시장 규모에 비례 배분하여 공통 출발 침투율을 역산합니다. 이는 실제 자금 출처를 관측한 값이 아니라 현재가를 맞추기 위한 가정입니다.</p><p>연도별 침투율 = 출발 침투율 + (목표 침투율 − 출발 침투율) × 채택 진행률. 가격 = 각 자산의 미래 경쟁 가능 시장 × 해당 연도 침투율의 합 ÷ BTC 공급량.</p><p>목표 도달 후 침투율은 유지되며 시장 성장과 공급량 변화는 계속 반영됩니다. 목표가 출발 침투율보다 낮은 자산은 비중이 줄어드는 시나리오가 됩니다. 채택 진행률이 S자여도 가격은 시장 성장·목표치·공급량에 따라 다른 형태가 될 수 있습니다.</p></details>
    {error&&<p className="error" role="alert">{error}</p>}
    {!error&&first&&last&&target&&<>
      <div className="tam-metrics"><div><span>{first.year}년 출발 가격 · 현재가 고정</span><strong>{formatMoney(first.btcPrice)}</strong></div><div><span>현재가에 맞춘 출발 침투율</span><strong>{percent(first.initialPenetration)}</strong><small>관측 점유율이 아닌 자동 보정값</small></div><div><span>{target.year}년 목표 침투율 도달 가격</span><strong>{formatMoney(target.btcPrice)}</strong></div><div><span>{last.year}년 채택 진행률</span><strong>{percent(last.adoptionProgress*100)}</strong></div></div>
      {first.contributions.some(c=>c.targetPenetration<c.initialPenetration)&&<p className="tam-notice">일부 자산의 목표 침투율이 출발 침투율보다 낮습니다. 해당 자산의 침투율은 목표까지 점진적으로 감소합니다.</p>}
      {target.btcPrice===0&&<p className="tam-notice">목표 가격이 0입니다. 가치 소멸 시나리오로 표시하지만, 가격으로 매수 수량을 나누는 포트폴리오·Monte Carlo 계산에는 양수 목표가 필요합니다.</p>}
      <h3>연도별 TAM 가격 경로</h3><label className="check-label"><input type="checkbox" checked={showTarget} onChange={e=>setShowTarget(e.target.checked)}/>목표 침투율을 즉시 적용한 참고선 표시 · 점선</label><TamPathChart rows={rows} showTarget={showTarget}/>
      <h3>목표 침투율로 전환되는 진행률</h3><p className="muted">0%는 현재 상태, 100%는 입력한 목표 침투율 도달입니다. BTC의 시장 점유율 자체가 아닙니다.</p><TamPathChart rows={rows} progress/>
      <details className="ui-inline-disclosure"><summary>{last.year}년 자산군별 세부 결과</summary><div className="table-scroll"><table><thead><tr><th>자산군</th><th>출발 침투율</th><th>{last.year}년 침투율</th><th>{target.year}년 목표</th><th>경쟁 가능 TAM</th><th>BTC 가치 기여</th></tr></thead><tbody>{last.contributions.map(c=><tr key={c.key}><th>{c.label}</th><td>{percent(c.initialPenetration)}</td><td>{percent(c.penetration)}</td><td>{percent(c.targetPenetration)}</td><td>{trillion(c.addressableMarket)}</td><td>{trillion(c.capturedValue)}</td></tr>)}</tbody></table></div>
      </details><details className="ui-inline-disclosure"><summary>연도별 채택 경로와 금액</summary><div className="table-scroll"><table><thead><tr><th>연도</th><th>채택 진행률</th><th>전체 TAM</th><th>경쟁 가능 TAM</th><th>BTC 시가총액</th><th>BTC 공급량</th><th>채택 반영 가격</th></tr></thead><tbody>{rows.map(r=><tr key={r.year}><th>{r.year}</th><td>{percent(r.adoptionProgress*100)}</td><td>{trillion(r.totalMarket)}</td><td>{trillion(r.addressableMarket)}</td><td>{trillion(r.marketCap)}</td><td>{r.btcSupply.toLocaleString('ko-KR',{maximumFractionDigits:0})}</td><td>{formatMoney(r.btcPrice)}</td></tr>)}</tbody></table></div>
    </details></>}
  </section>;
}
