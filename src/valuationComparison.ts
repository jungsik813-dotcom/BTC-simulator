import { calculateTamRange, defaultTamAdoption, type TamAdoptionAssumptions, type TamAssumptions, type TamYearResult } from './tam.ts';
import { calculatePowerLawRange, type PowerLawAssumptions, type PowerLawYearResult } from './powerLaw.ts';
import { calculateOnchain, type OnchainSnapshot, type SupplyMode } from './onchain.ts';
import { btcSupplyAtYear } from './tam.ts';

export const valuationSeries = [
  {key:'cagr',label:'CAGR BTC Price',color:'#24332f',dash:undefined},
  {key:'tam',label:'TAM Price',color:'#246957',dash:undefined},
  {key:'support',label:'Power Law Support',color:'#57769c',dash:'4 4'},
  {key:'fair',label:'Power Law Fair',color:'#57769c',dash:undefined},
  {key:'resistance',label:'Power Law Resistance',color:'#57769c',dash:'9 5'},
  {key:'costBasis',label:'온체인 비교 기준가',color:'#84918b',dash:'3 6'},
] as const;
export type ValuationKey = typeof valuationSeries[number]['key'];
export type VisibleValuations = Record<ValuationKey,boolean>;
export const defaultVisibleValuations = ():VisibleValuations => ({cagr:true,tam:true,support:true,fair:true,resistance:true,costBasis:true});
export interface ComparisonOnchain {
  activeSupply:number; comparisonSupply:number; trueMarketMeanUsd:number|null; costBasisUsd:number|null;
  realizedPriceUsd:number; investorCapUsd:number; classicMvrv:number|null; aviv:number|null; comparisonRatio:number|null;
}
export interface ValuationRow extends Record<ValuationKey,number|null> {
  year:number; supply:number; tamDetail:TamYearResult|null; powerDetail:PowerLawYearResult|null;
  onchain:ComparisonOnchain|null; selectedPrice:number|null; selectedMarketCap:number|null;
}
export interface ComparisonInput {
  startYear:number; endYear:number; btcPrice:number; btcReturn:number; priceModel:'cagr'|'tam';
  tam:TamAssumptions|null; power:PowerLawAssumptions|null; onchain:OnchainSnapshot|null; supplyMode:SupplyMode;
  tamAdoption?:TamAdoptionAssumptions;
}

export function calculateValuationComparison(a:ComparisonInput):{rows:ValuationRow[];errors:string[]} {
  if(!Number.isInteger(a.startYear)||!Number.isInteger(a.endYear)||a.startYear<2024||a.endYear>2200||a.endYear<a.startYear) throw new Error('전체 모델 비교는 2024~2200 범위의 시작·종료 연도를 사용합니다.');
  const errors:string[]=[];
  const years=Array.from({length:a.endYear-a.startYear+1},(_,i)=>a.startYear+i);
  let cagrPrices:number[]=[];
  try {
    if(!Number.isFinite(a.btcPrice)||a.btcPrice<=0||!Number.isFinite(a.btcReturn)||a.btcReturn<=-100)throw new Error('CAGR 가격과 수익률을 확인해 주세요.');
    cagrPrices=years.map((_,i)=>a.btcPrice*(1+a.btcReturn/100)**i);
    if(cagrPrices.some(v=>!Number.isFinite(v)||v<=0))throw new Error('CAGR 계산 범위를 벗어났습니다.');
  }catch(e){cagrPrices=[];errors.push((e as Error).message);}
  let tamRows:TamYearResult[]=[],powerRows:PowerLawYearResult[]=[];
  if(a.tam)try{tamRows=calculateTamRange(a.startYear,a.endYear,a.tam,{initialPrice:a.btcPrice,adoption:a.tamAdoption??defaultTamAdoption});}catch(e){errors.push((e as Error).message);}
  if(a.power)try{powerRows=calculatePowerLawRange(a.startYear,a.endYear,a.power);}catch(e){errors.push((e as Error).message);}
  const rows=years.map((year,i):ValuationRow=>{
    const supply=btcSupplyAtYear(year),t=tamRows[i]??null,p=powerRows[i]??null;
    const cagr=cagrPrices[i]??null,tam=t?.btcPrice??null;
    const selectedPrice=a.priceModel==='tam'?tam:cagr;
    const selectedMarketCap=selectedPrice===null?null:selectedPrice*supply;
    if(selectedMarketCap!==null&&!Number.isFinite(selectedMarketCap))throw new Error('선택 모델 시가총액이 계산 범위를 벗어났습니다.');
    let onchain:ComparisonOnchain|null=null,costBasis:number|null=null;
    if(a.onchain&&a.power){
      try {
        if(!Number.isFinite(a.power.usdKrw)||a.power.usdKrw<=0)throw new Error('고정 USD/KRW 환산율을 확인해 주세요.');
        const s=a.onchain,scale=supply/s.circulatingSupply;
        const r=calculateOnchain({...s,circulatingSupply:supply,excluded5:s.excluded5*scale,excluded7:s.excluded7*scale,excluded10:s.excluded10*scale},a.supplyMode);
        const spot=selectedPrice===null?null:selectedPrice/a.power.usdKrw;
        const mvrv=selectedMarketCap===null?null:(selectedMarketCap/a.power.usdKrw)/s.realizedCapUsd;
        const aviv=spot===null||r.trueMarketMean===null||r.trueMarketMean<=0?null:spot/r.trueMarketMean;
        const comparisonRatio=spot===null||r.comparisonCostBasis===null||r.comparisonCostBasis<=0?null:spot/r.comparisonCostBasis;
        costBasis=r.comparisonCostBasis===null?null:r.comparisonCostBasis*a.power.usdKrw;
        if([costBasis,mvrv,aviv,comparisonRatio].some(v=>v!==null&&!Number.isFinite(v)))throw new Error('온체인 연도별 비교가 계산 범위를 벗어났습니다.');
        onchain={activeSupply:r.activeSupply,comparisonSupply:r.comparisonSupply,trueMarketMeanUsd:r.trueMarketMean,costBasisUsd:r.comparisonCostBasis,realizedPriceUsd:r.realizedPrice,investorCapUsd:r.investorCap,classicMvrv:mvrv,aviv,comparisonRatio};
      }catch(e){const message=(e as Error).message;if(!errors.includes(message))errors.push(message);costBasis=null;}
    }
    return {year,supply,cagr,tam,support:p?.support??null,fair:p?.fair??null,resistance:p?.resistance??null,costBasis,selectedPrice,selectedMarketCap,tamDetail:t,powerDetail:p,onchain};
  });
  return {rows,errors};
}

export function chartScale(values:(number|null)[],logarithmic:boolean) {
  const valid=values.filter((v):v is number=>v!==null&&Number.isFinite(v)&&(!logarithmic||v>0));
  if(!valid.length)return null;
  const transformed=valid.map(v=>logarithmic?Math.log10(v):v);
  let min=logarithmic?Math.min(...transformed):Math.min(0,...transformed),max=Math.max(...transformed);
  if(max<=min)max=min+(logarithmic?1:Math.max(1,Math.abs(min)*0.1));
  return {min,max,position:(value:number|null)=>value===null||!Number.isFinite(value)||(logarithmic&&value<=0)?null:((logarithmic?Math.log10(value):value)-min)/(max-min),tick:(fraction:number)=>logarithmic?10**(min+(max-min)*fraction):min+(max-min)*fraction};
}
