import { simulate, type Assumptions } from './simulation.ts';
import type { TamAdoptionAssumptions } from './tam.ts';
import { defaultMarketAssumptions, validateMarket, correlatedShocks, nextRegime, sampleJump, STUDENT_MIN_FACTOR, type MarketAssumptions, type Regime } from './marketModel.ts';

export interface MonteCarloAssumptions {
  paths: number; seed: number; btcMean: number; btcVolatility: number;
  stockMean: number; stockVolatility: number; inflationMean: number; inflationVolatility: number;
  fxMean: number; fxVolatility: number; minBtcReturn: number; maxBtcReturn: number;
  btcCenter: 'return'|'tam'; limitBtcReturns: boolean;
}
export const defaultMonteCarlo: MonteCarloAssumptions = {
  paths:10000, seed:42, btcMean:10, btcVolatility:60, stockMean:7, stockVolatility:20,
  inflationMean:2, inflationVolatility:1, fxMean:1400, fxVolatility:10,
  minBtcReturn:-80, maxBtcReturn:300, btcCenter:'return', limitBtcReturns:false,
};
export interface MonteCarloRequest {
  portfolio:Assumptions;
  assumptions:MonteCarloAssumptions;
  // 시작 연도는 현물 가격, 이후는 TAM의 KRW 가격. 실행 시점의 가정을 고정한다.
  btcCentersKrw?:number[];
  market?:MarketAssumptions;
  tamAdoption?:TamAdoptionAssumptions;
}
export interface Percentiles { p10:number;p25:number;p50:number;p75:number;p90:number;mean:number }
export interface MonteCarloYear {year:number;nominal:Percentiles;real:Percentiles;regimeCounts?:Record<Regime,number>}
export interface MarketDiagnostics {crashes:number;manias:number;btcFloors:number;stockFloors:number;pathYears:number}
export interface MonteCarloResult {rows:MonteCarloYear[];paths:number;seed:number;diagnostics:MarketDiagnostics}
export type MonteCarloMessage = {type:'progress';percent:number}|{type:'result';result:MonteCarloResult}|{type:'error';message:string};

export function validateMonteCarlo(a:MonteCarloAssumptions):void {
  if(![1000,10000,100000].includes(a.paths))throw new Error('시뮬레이션 횟수는 1,000 / 10,000 / 100,000 중 선택하세요.');
  if(!Number.isInteger(a.seed)||a.seed<0||a.seed>4294967295)throw new Error('난수 seed는 0~4,294,967,295의 정수여야 합니다.');
  if(![a.btcMean,a.btcVolatility,a.stockMean,a.stockVolatility,a.inflationMean,a.inflationVolatility,a.fxMean,a.fxVolatility,a.minBtcReturn,a.maxBtcReturn].every(Number.isFinite))throw new Error('Monte Carlo 가정을 유효한 숫자로 입력해 주세요.');
  if(a.btcMean<=-100||a.stockMean<=-100||a.inflationMean<=-100)throw new Error('기대수익률과 평균 물가상승률은 -100%보다 커야 합니다.');
  if([a.btcVolatility,a.stockVolatility,a.inflationVolatility,a.fxVolatility].some(v=>v<0))throw new Error('변동성은 음수일 수 없습니다.');
  if(a.fxMean<=0)throw new Error('USD/KRW 평균은 0보다 커야 합니다.');
  if(a.btcCenter!=='return'&&a.btcCenter!=='tam')throw new Error('BTC 중심 경로를 선택해 주세요.');
  if(typeof a.limitBtcReturns!=='boolean')throw new Error('BTC 수익률 제한 설정을 확인해 주세요.');
  if(a.limitBtcReturns&&(a.minBtcReturn<=-100||a.maxBtcReturn<a.minBtcReturn))throw new Error('BTC 수익률 하한은 -100%보다 커야 하며 상한 이하여야 합니다.');
}
export function validateMonteCarloRequest(request:MonteCarloRequest):void {
  const {portfolio:p,assumptions:a}=request;
  validateMonteCarlo(a);
  validateMarket(request.market??defaultMarketAssumptions());
  // 사용하지 않는 결정론적 CAGR 때문에 확률 실행을 막지 않는다.
  simulate({...p,btcReturn:0,stockReturn:0,inflation:0});
  const years=p.endYear-p.startYear+1;
  if(years*a.paths>5_000_000)throw new Error('이 기간과 실행 횟수는 메모리 한도를 넘습니다. 기간이나 횟수를 줄여 주세요.');
  if(a.btcCenter==='tam'&&(!request.btcCentersKrw||request.btcCentersKrw.length!==years||request.btcCentersKrw.some(v=>!Number.isFinite(v)||v<=0)))throw new Error('TAM 경로의 모든 연도 가격이 양수여야 합니다. TAM 가정을 확인해 주세요.');
}

export function seededUniform(seed:number):()=>number {
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return (((t^(t>>>14))>>>0)+0.5)/4294967296;
  };
}
export function standardNormal(random:()=>number):()=>number {
  let spare:number|undefined;
  return ()=>{
    if(spare!==undefined){const value=spare;spare=undefined;return value;}
    const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random();
    spare=radius*Math.sin(angle);
    return radius*Math.cos(angle);
  };
}
// multiplier의 산술 평균을 유지하고 log 변동성을 적용한다.
export function lognormalFactor(meanMultiplier:number,logVolatility:number,z:number):number {
  return meanMultiplier*Math.exp(-0.5*logVolatility**2+logVolatility*z);
}
export function percentile(sorted:ArrayLike<number>,q:number):number {
  if(!sorted.length||!Number.isFinite(q)||q<0||q>1)throw new Error('분위수 입력 범위 오류');
  const position=(sorted.length-1)*q,lower=Math.floor(position),fraction=position-lower;
  return sorted[lower]*(1-fraction)+sorted[Math.min(lower+1,sorted.length-1)]*fraction;
}
function summarize(samples:Float64Array):Percentiles {
  let mean=0;
  for(const value of samples)mean+=value/samples.length;
  samples.sort();
  const result={p10:percentile(samples,.1),p25:percentile(samples,.25),p50:percentile(samples,.5),p75:percentile(samples,.75),p90:percentile(samples,.9),mean};
  if(!Object.values(result).every(Number.isFinite))throw new Error('분포 집계가 계산 범위를 벗어났습니다. 가정을 줄여 주세요.');
  return result;
}

export function runMonteCarlo(request:MonteCarloRequest,onProgress?:(percent:number)=>void):MonteCarloResult {
  validateMonteCarloRequest(request);
  const {portfolio:p,assumptions:a}=request,years=p.endYear-p.startYear+1;
  const nominal=Array.from({length:years},()=>new Float64Array(a.paths));
  const real=Array.from({length:years},()=>new Float64Array(a.paths));
  const market=request.market??defaultMarketAssumptions();
  const random=seededUniform(a.seed),z=standardNormal(random);
  const inflationSigma=a.inflationVolatility/100,fxSigma=a.fxVolatility/100;
  const regimeCounts=Array.from({length:years},()=>({riskOn:0,normal:0,crisis:0}));
  const diagnostics:MarketDiagnostics={crashes:0,manias:0,btcFloors:0,stockFloors:0,pathYears:a.paths*(years-1)};
  const initial=p.btcQuantity*p.btcPrice+p.stocks+p.cash-p.debt;
  let lastProgress=-1;
  const report=(value:number)=>{if(value!==lastProgress){lastProgress=value;onProgress?.(value);}};
  for(let path=0;path<a.paths;path++){
    let btcUsd=p.btcPrice/a.fxMean,quantity=p.btcQuantity,stockUsd=p.stocks/a.fxMean,debt=p.debt,inflationIndex=1;
    let state=market.initialRegime;
    nominal[0][path]=initial;real[0][path]=initial;
    for(let t=1;t<years;t++){
      if(market.regimeEnabled){if(t>1)state=nextRegime(state,market.transitions,random());regimeCounts[t][state]++;}
      const regime=market.regimeEnabled?market.regimes[state]:undefined;
      let btcMean=a.btcCenter==='tam'?request.btcCentersKrw![t]/(t===1?p.btcPrice:request.btcCentersKrw![t-1]):1+(regime?.btcMean??a.btcMean)/100;
      // TAM remains the Normal-state center; other states apply relative gross-return shifts.
      if(regime&&a.btcCenter==='tam')btcMean*=(1+regime.btcMean/100)/(1+market.regimes.normal.btcMean/100);
      const stockMean=1+(regime?.stockMean??a.stockMean)/100;
      const btcSigma=(regime?.btcVolatility??a.btcVolatility)/100,stockSigma=(regime?.stockVolatility??a.stockVolatility)/100;
      const [btcShock,stockShock]=correlatedShocks(market.distribution,market.degreesOfFreedom,regime?.correlation??0,random,z);
      let btcFactor:number,stockFactor:number;
      if(market.distribution==='studentT'){
        const rawBtc=btcMean+btcSigma*btcShock,rawStock=stockMean+stockSigma*stockShock;
        if(rawBtc<STUDENT_MIN_FACTOR)diagnostics.btcFloors++;
        if(rawStock<STUDENT_MIN_FACTOR)diagnostics.stockFloors++;
        btcFactor=Math.max(STUDENT_MIN_FACTOR,rawBtc);stockFactor=Math.max(STUDENT_MIN_FACTOR,rawStock);
      }else{btcFactor=lognormalFactor(btcMean,btcSigma,btcShock);stockFactor=lognormalFactor(stockMean,stockSigma,stockShock);}
      if(market.jumpEnabled){const jump=sampleJump(market,random());btcFactor*=jump.factor;if(jump.kind==='crash')diagnostics.crashes++;if(jump.kind==='mania')diagnostics.manias++;}
      if(!Number.isFinite(btcFactor)||!Number.isFinite(stockFactor))throw new Error('수익률이 계산 범위를 벗어났습니다. 시장 모형 가정을 줄여 주세요.');
      if(a.limitBtcReturns)btcFactor=Math.max(1+a.minBtcReturn/100,Math.min(1+a.maxBtcReturn/100,btcFactor));
      btcUsd*=btcFactor;
      stockUsd*=stockFactor;
      inflationIndex*=lognormalFactor(1+a.inflationMean/100,inflationSigma,z());
      // FX는 독립적인 연간 수준 추출: 매년 입력 평균을 갖는 로그정규 값.
      const fx=lognormalFactor(a.fxMean,fxSigma,z()),btcKrw=btcUsd*fx;
      if(![btcUsd,btcKrw,fx,inflationIndex].every(v=>Number.isFinite(v)&&v>0))throw new Error('경로 값이 계산 범위를 벗어났습니다. 변동성·수익률·기간을 줄여 주세요.');
      quantity+=p.monthlyBtc*12/btcKrw;
      stockUsd+=p.monthlyStocks*12/fx;
      debt*=1+p.debtRate/100;
      const value=quantity*btcKrw+stockUsd*fx+p.cash-debt,realValue=value/inflationIndex;
      if(![quantity,stockUsd,debt,value,realValue].every(Number.isFinite))throw new Error('자산 경로가 계산 범위를 벗어났습니다. 가정을 줄여 주세요.');
      nominal[t][path]=value;real[t][path]=realValue;
    }
    if(path%1000===0)report(Math.floor(path/a.paths*80));
  }
  const rows:MonteCarloYear[]=[];
  for(let t=0;t<years;t++){
    rows.push({year:p.startYear+t,nominal:summarize(nominal[t]),real:summarize(real[t]),...(market.regimeEnabled&&t>0?{regimeCounts:regimeCounts[t]}:{})});
    report(80+Math.round((t+1)/years*20));
  }
  return {rows,paths:a.paths,seed:a.seed,diagnostics};
}
