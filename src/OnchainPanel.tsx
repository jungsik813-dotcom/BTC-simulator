import { useId, useState } from 'react';
import { calculateOnchain, ONCHAIN_SOURCE, supplyModes, type SupplyMode } from './onchain';
import { defaultOnchainSettings, parseOnchainInputs, type OnchainInputs, type OnchainSettings, type MarketCapSource } from './onchainInput';
import { formatMoney } from './settings';

const number = (value:number) => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:4}).format(value);
const ratio = (value:number|null) => value===null?'계산 불가':`${number(value)}×`;
const price = (value:number|null) => value===null?'계산 불가':formatMoney(value,'USD');
const fields: {key:keyof OnchainInputs;label:string;unit:string;min:number;max?:number;positive?:boolean}[] = [
  {key:'realizedCapBillionUsd',label:'Realized Cap',unit:'십억 USD (Billion)',min:0,positive:true},
  {key:'thermocapBillionUsd',label:'Thermocap',unit:'십억 USD (Billion)',min:0},
  {key:'circulatingSupply',label:'유통 공급량',unit:'BTC',min:0,max:21_000_000,positive:true},
  {key:'liveliness',label:'Liveliness',unit:'비율 0~1',min:0,max:1},
  {key:'spotPriceUsd',label:'Spot Price',unit:'USD / BTC',min:0,positive:true},
  {key:'marketCapBillionUsd',label:'BTC Market Cap · 직접 입력',unit:'십억 USD (Billion)',min:0},
];
const exclusionFields: {key:keyof OnchainInputs;label:string}[] = [
  {key:'excluded5',label:'5년 이상 미이동 공급량'}, {key:'excluded7',label:'7년 이상 미이동 공급량'}, {key:'excluded10',label:'10년 이상 미이동 공급량'},
];
function Metric({label,value,help,note}: {label:string;value:string;help:string;note?:string}) {
  const [open,setOpen]=useState(false);
  const id=useId();
  return <article className="onchain-metric"><div className="metric-title"><span>{label}</span><div className="metric-help"><button type="button" aria-label={`${label} 설명`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>ⓘ</button><span id={id} role="tooltip" hidden={!open}>{help}</span></div></div><strong>{value}</strong>{note&&<small>{note}</small>}</article>;
}

export function OnchainPanel({settings,onChange}: {settings:OnchainSettings;onChange:(value:OnchainSettings)=>void}) {
  const {inputs,supplyMode,marketCapSource}=settings;
  let error='',result:ReturnType<typeof calculateOnchain>|undefined,snapshot:ReturnType<typeof parseOnchainInputs>|undefined;
  try { snapshot=parseOnchainInputs(inputs,marketCapSource);result=calculateOnchain(snapshot,supplyMode); } catch(e) { error=(e as Error).message; }
  const updateInput=(key:keyof OnchainInputs,value:string)=>onChange({...settings,inputs:{...inputs,[key]:value}});
  const experimental=supplyMode.startsWith('exclude');
  const modeLabel=supplyModes.find(mode=>mode.key===supplyMode)!.label;
  const difference=result?`${result.realizedPriceDifferencePct>0?'+':''}${number(result.realizedPriceDifferencePct)}%`:'';
  return <section className="card onchain-panel">
    <div className="section-heading"><div><p className="eyebrow">ON-CHAIN · SANITY CHECK</p><h2>Realized Cap / MVRV / Cointime</h2></div><button type="button" className="text-button" onClick={()=>onChange(defaultOnchainSettings())}>온체인 예시값으로 초기화</button></div>
    <p className="muted">현재 가치평가 상태를 살펴보는 참고 지표입니다. 기본값은 설명용 예시입니다. 같은 시점의 데이터를 직접 입력하세요.</p>
    <div className="onchain-inputs">{fields.filter(field=>field.key!=='marketCapBillionUsd'||marketCapSource==='manual').map(field=>{const value=inputs[field.key],n=Number(value);const invalid=value.trim()===''||!Number.isFinite(n)||(field.positive?n<=field.min:n<field.min)||(field.max!==undefined&&n>field.max);return <label key={field.key}><span>{field.label}</span><div className={`input-wrap ${invalid?'invalid':''}`}><input type="number" step="any" min={field.min} max={field.max} value={value} aria-invalid={invalid} onChange={event=>updateInput(field.key,event.target.value)}/><span>{field.unit}</span></div>{invalid&&<span className="field-error">입력 범위를 확인해 주세요.</span>}</label>})}</div>
    <div className="onchain-options"><label><span>BTC Market Cap 입력 방식</span><select value={marketCapSource} onChange={event=>onChange({...settings,marketCapSource:event.target.value as MarketCapSource})}><option value="spot">Spot Price × 유통 공급량</option><option value="manual">직접 입력</option></select></label><div className="snapshot-context"><span>계산에 사용한 BTC 시가총액</span><b>{snapshot?formatMoney(snapshot.marketCapUsd,'USD'):'—'}</b>{marketCapSource==='manual'&&snapshot&&<small>Spot × 공급량: {formatMoney(snapshot.spotPriceUsd*snapshot.circulatingSupply,'USD')} · 서로 다른 시점의 값을 섞지 않도록 확인하세요.</small>}</div></div>
    <p className="muted">온체인 입력은 포트폴리오의 BTC 현재가와 별도로 관리됩니다. API 조회 없이 입력한 숫자만 사용합니다.</p>
    {error?<div className="error inline-error" role="alert">{error}</div>:result&&<>
      <div className="onchain-metrics">
        <Metric label="Classic MVRV" value={ratio(result.classicMvrv)} help="BTC Market Cap ÷ Realized Cap. 유통 공급량 전체를 기준으로 시가총액과 실현 시가총액을 비교합니다." note="전체 유통 공급량 기준"/>
        <Metric label="Realized Price" value={price(result.realizedPrice)} help="Realized Cap ÷ 유통 공급량. 코인이 마지막으로 이동한 가격을 바탕으로 계산한 평균 원가입니다." note={`Spot 대비 ${difference} · (Realized − Spot) / Spot`}/>
        <Metric label="True Market Mean" value={price(result.trueMarketMean)} help="(Realized Cap − Thermocap) ÷ (유통 공급량 × Liveliness). Cointime Weighted 기준 평균 원가입니다." note={result.trueMarketMean===null?'Active Supply가 0이므로 계산할 수 없습니다.':'Cointime Weighted 기준'}/>
        <Metric label="AVIV" value={ratio(result.aviv)} help="Spot Price ÷ True Market Mean. Active Market Cap과 Investor Cap의 비율과 동일합니다. Classic MVRV와 계산식이 다릅니다." note={result.aviv===null?'양수 True Market Mean이 필요합니다.':'Cointime Weighted 기준'}/>
        <Metric label="Active Supply" value={`${number(result.activeSupply)} BTC`} help="유통 공급량 × Liveliness. 코인 연령으로 일괄 제외하는 방식과는 다른 Cointime 공급량 가중치입니다." note="Cointime Weighted 기준"/>
      </div>
      <div className="onchain-formulas formula">Investor Cap = Realized Cap − Thermocap · 입력 기준 {formatMoney(result.investorCap,'USD')}<br/>True Market Mean = Investor Cap / Active Supply · AVIV = Spot / True Market Mean</div>
    </>}
    <div className="supply-comparison"><div className="section-heading"><div><h3>Active Supply 비교</h3><p className="muted">위의 공식 Cointime 지표와 별도로 공급량 가정의 영향을 비교합니다.</p></div><label className="mode-selector"><span>비교 방식</span><select value={supplyMode} onChange={event=>onChange({...settings,supplyMode:event.target.value as SupplyMode})}>{supplyModes.map(mode=><option key={mode.key} value={mode.key}>{mode.label}</option>)}</select></label></div>
      {experimental&&<p className="experiment-note">실험용 hard cutoff입니다. 미이동 기간만으로 분실 코인을 확정할 수 없습니다. Investor Cap은 유지하고 공급량만 제외하므로 이 비교 기준가는 연령별 취득원가를 조정한 공식 지표가 아닙니다.</p>}
      <p className="muted">연령 제외 모드에 사용하는 미이동 공급량 가정</p><div className="exclusion-inputs">{exclusionFields.map(field=><label key={field.key}><span>{field.label}</span><div className="input-wrap"><input type="number" step="any" min="0" max={Number(inputs.circulatingSupply)} value={inputs[field.key]} onChange={event=>updateInput(field.key,event.target.value)}/><span>BTC</span></div></label>)}</div><p className="muted">5년 이상 ≥ 7년 이상 ≥ 10년 이상 · 각 값은 누적 미이동 공급량이며, 선택한 기준의 수량만 한 번 차감합니다.</p>
      {result&&<div className="comparison-metrics"><Metric label={`${modeLabel} 공급량`} value={`${number(result.comparisonSupply)} BTC`} help="Classic은 전체 공급량, Cointime Weighted는 공급량 × Liveliness, 연령 제외는 공급량 − 선택한 미이동 수량을 사용합니다."/><Metric label={supplyMode==='cointime'?'비교 기준가 · True Market Mean':'비교 기준가 · 공급량 가정'} value={price(result.comparisonCostBasis)} help="Investor Cap ÷ 선택한 비교 공급량. Cointime Weighted 선택 시 공식 True Market Mean과 동일합니다."/><Metric label={supplyMode==='cointime'?'비교 비율 · AVIV':'Spot / 비교 기준가'} value={ratio(result.comparisonRatio)} help="Spot ÷ 비교 기준가. Cointime Weighted 선택 시 공식 AVIV와 동일하며, 다른 방식에서는 실험용 비교 비율입니다."/></div>}
    </div>
    <p className="muted">공식 지표 계산식: <a href={ONCHAIN_SOURCE} target="_blank" rel="noreferrer">Glassnode Cointime / AVIV 정의</a>. 장기 목표가격이나 포트폴리오 경로에 적용하지 않습니다.</p>
  </section>;
}
