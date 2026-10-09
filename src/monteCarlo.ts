import { JUMP_CALIBRATION } from './jumpCalibration.ts';
import { simulate, type Assumptions } from './simulation.ts';
import { defaultMarketAssumptions, validateMarket, sampleShock, nextRegime, decomposeJumps, sampleCompoundJumps, STUDENT_MIN_FACTOR, type MarketAssumptions, type Regime } from './marketModel.ts';

export interface MonteCarloAssumptions {
  paths: number; seed: number; btcMean: number; btcVolatility: number;
  minBtcReturn: number; maxBtcReturn: number;
  limitBtcReturns: boolean;
}
export const MONTE_CARLO_PATHS=100000;
export const defaultMonteCarlo: MonteCarloAssumptions = {
  paths:MONTE_CARLO_PATHS, seed:42, btcMean:10, btcVolatility:49,
  minBtcReturn:-80, maxBtcReturn:300, limitBtcReturns:false,
};
export interface MonteCarloRequest {
  portfolio:Assumptions;
  assumptions:MonteCarloAssumptions;
  market?:MarketAssumptions;
}
export interface Percentiles { p10:number;p25:number;p50:number;p75:number;p90:number;mean:number }
export interface MonteCarloYear {year:number;btcValue:Percentiles;regimeCounts?:Record<Regime,number>}
export interface MarketDiagnostics {crashes:number;manias:number;btcFloors:number;pathYears:number}
export interface MonteCarloResult {rows:MonteCarloYear[];paths:number;seed:number;diagnostics:MarketDiagnostics}
export type MonteCarloMessage = {type:'progress';percent:number}|{type:'result';result:MonteCarloResult}|{type:'error';message:string};

export function validateMonteCarlo(a:MonteCarloAssumptions):void {
  if(a.paths!==MONTE_CARLO_PATHS)throw new Error('Monte Carlo는 항상 100,000회로 실행합니다.');
  if(!Number.isInteger(a.seed)||a.seed<0||a.seed>4294967295)throw new Error('난수 seed는 0~4,294,967,295의 정수여야 합니다.');
  if(![a.btcMean,a.btcVolatility,a.minBtcReturn,a.maxBtcReturn].every(Number.isFinite))throw new Error('Monte Carlo 가정을 유효한 숫자로 입력해 주세요.');
  if(a.btcMean<=-100)throw new Error('기대수익률은 -100%보다 커야 합니다.');
  if(a.btcVolatility<0)throw new Error('변동성은 음수일 수 없습니다.');
  if(typeof a.limitBtcReturns!=='boolean')throw new Error('BTC 수익률 제한 설정을 확인해 주세요.');
  if(a.limitBtcReturns&&(a.minBtcReturn<=-100||a.maxBtcReturn<a.minBtcReturn))throw new Error('BTC 수익률 하한은 -100%보다 커야 하며 상한 이하여야 합니다.');
}
export function validateMonteCarloRequest(request:MonteCarloRequest):void {
  const {portfolio:p,assumptions:a}=request;
  validateMonteCarlo(a);
  validateMarket(request.market??defaultMarketAssumptions());
  // 사용하지 않는 결정론적 CAGR 때문에 확률 실행을 막지 않는다.
  simulate({...p,btcReturn:0});
  const market=request.market??defaultMarketAssumptions();
  if(market.jumpEnabled&&!market.regimeEnabled)decomposeJumps(a.btcMean,a.btcVolatility,JUMP_CALIBRATION.all,market.jumpIntensity);
  const years=p.endYear-p.startYear+1;
  if(years*a.paths>5_000_000)throw new Error('이 기간과 실행 횟수는 메모리 한도를 넘습니다. 시뮬레이션 기간을 줄여 주세요.');
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
  const values=Array.from({length:years},()=>new Float64Array(a.paths));
  const market=request.market??defaultMarketAssumptions();
  const plans=market.jumpEnabled&&market.jumpIntensity>0?(market.regimeEnabled?{bull:decomposeJumps(market.regimes.bull.btcMean,market.regimes.bull.btcVolatility,JUMP_CALIBRATION.bull,market.jumpIntensity),bear:decomposeJumps(market.regimes.bear.btcMean,market.regimes.bear.btcVolatility,JUMP_CALIBRATION.bear,market.jumpIntensity),all:null}:{bull:null,bear:null,all:decomposeJumps(a.btcMean,a.btcVolatility,JUMP_CALIBRATION.all,market.jumpIntensity)}):null;
  const random=seededUniform(a.seed),z=standardNormal(random);
  const regimeCounts=Array.from({length:years},()=>({bull:0,bear:0}));
  const diagnostics:MarketDiagnostics={crashes:0,manias:0,btcFloors:0,pathYears:a.paths*(years-1)};
  const initial=p.btcQuantity*p.btcPrice;
  let lastProgress=-1;
  const report=(value:number)=>{if(value!==lastProgress){lastProgress=value;onProgress?.(value);}};
  for(let path=0;path<a.paths;path++){
    let price=p.btcPrice,quantity=p.btcQuantity,state=market.initialRegime;
    values[0][path]=initial;
    for(let t=1;t<years;t++){
      if(market.regimeEnabled){if(t>1)state=nextRegime(state,market.transitions,random());regimeCounts[t][state]++;}
      const regime=market.regimeEnabled?market.regimes[state]:undefined;
      const mean=1+(regime?.btcMean??a.btcMean)/100,sigma=(regime?.btcVolatility??a.btcVolatility)/100;
      const shock=sampleShock(market.distribution,market.degreesOfFreedom,random,z);
      let factor:number;
      if(market.distribution==='studentT'){
        const raw=mean+sigma*shock;
        if(raw<STUDENT_MIN_FACTOR)diagnostics.btcFloors++;
        factor=Math.max(STUDENT_MIN_FACTOR,raw);
      }else factor=lognormalFactor(mean,sigma,shock);
      if(plans){
        const plan=market.regimeEnabled?plans[state]!:plans.all!;
        const jump=sampleCompoundJumps(plan,random);
        factor=Math.exp(plan.residualLogMean+Math.sqrt(plan.residualVariance)*shock+jump.logMove);
        diagnostics.crashes+=jump.crashes;diagnostics.manias+=jump.manias;
      }
      if(!Number.isFinite(factor))throw new Error('수익률이 계산 범위를 벗어났습니다. 시장 모형 가정을 줄여 주세요.');
      if(a.limitBtcReturns)factor=Math.max(1+a.minBtcReturn/100,Math.min(1+a.maxBtcReturn/100,factor));
      price*=factor;
      if(!Number.isFinite(price)||price<=0)throw new Error('BTC 가격이 계산 범위를 벗어났습니다. 변동성·수익률·기간을 줄여 주세요.');
      quantity+=p.monthlyBtc*12/price;
      const value=quantity*price;
      if(!Number.isFinite(quantity)||!Number.isFinite(value))throw new Error('BTC 평가액이 계산 범위를 벗어났습니다. 가정을 줄여 주세요.');
      values[t][path]=value;
    }
    if(path%1000===0)report(Math.floor(path/a.paths*80));
  }
  const rows:MonteCarloYear[]=[];
  for(let t=0;t<years;t++){
    rows.push({year:p.startYear+t,btcValue:summarize(values[t]),...(market.regimeEnabled&&t>0?{regimeCounts:regimeCounts[t]}:{})});
    report(80+Math.round((t+1)/years*20));
  }
  return {rows,paths:a.paths,seed:a.seed,diagnostics};
}
