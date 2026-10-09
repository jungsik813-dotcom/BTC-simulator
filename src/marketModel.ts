import { JUMP_CALIBRATION, type JumpCalibration } from './jumpCalibration.ts';
export const REGIMES=['bull','bear'] as const;
export type Regime=typeof REGIMES[number];
export const REGIME_LABELS:Record<Regime,string>={bull:'상승장',bear:'하락장'};
export interface RegimeAssumptions {btcMean:number;btcVolatility:number}
export interface MarketAssumptions {
  distribution:'normal'|'studentT';degreesOfFreedom:number;
  regimeEnabled:boolean;initialRegime:Regime;
  regimes:Record<Regime,RegimeAssumptions>;
  transitions:Record<Regime,Record<Regime,number>>;
  jumpEnabled:boolean;jumpIntensity:number;
}
export const STUDENT_MIN_FACTOR=.001;
export function defaultMarketAssumptions():MarketAssumptions {
  return {
    distribution:'normal',degreesOfFreedom:5,regimeEnabled:true,initialRegime:'bull',
    regimes:{bull:{btcMean:95.62,btcVolatility:47.10},bear:{btcMean:-40.86,btcVolatility:47.85}},
    // Duration assumption: expected bull spell 3 years, bear spell 1 year.
    transitions:{bull:{bull:66.67,bear:33.33},bear:{bull:100,bear:0}},
    jumpEnabled:true,jumpIntensity:1,
  };
}
export function validateMarket(a:MarketAssumptions):void {
  if(!a||!['normal','studentT'].includes(a.distribution))throw new Error('로그정규 또는 Student-t 분포를 선택하세요.');
  if(!Number.isFinite(a.degreesOfFreedom)||a.degreesOfFreedom<=2||a.degreesOfFreedom>200)throw new Error('Student-t 자유도는 2 초과, 200 이하로 입력하세요.');
  if(typeof a.regimeEnabled!=='boolean'||typeof a.jumpEnabled!=='boolean'||!REGIMES.includes(a.initialRegime))throw new Error('시장 국면과 Jump 설정을 확인하세요.');
  for(const state of REGIMES){
    const r=a.regimes?.[state],row=a.transitions?.[state];
    if(!r||![r.btcMean,r.btcVolatility].every(Number.isFinite)||r.btcMean<=-100||r.btcVolatility<0)throw new Error(`${REGIME_LABELS[state]}: 수익률은 -100% 초과, 변동성은 0 이상이어야 합니다.`);
    if(!row||REGIMES.some(key=>!Number.isFinite(row[key])||row[key]<0||row[key]>100)||Math.abs(REGIMES.reduce((sum,key)=>sum+row[key],0)-100)>1e-8)throw new Error(`${REGIME_LABELS[state]} 전이확률의 각 값은 0~100%, 행 합계는 100%여야 합니다.`);
  }
  if(!Number.isFinite(a.jumpIntensity)||a.jumpIntensity<0)throw new Error('Jump 빈도 배율은 0 이상의 숫자여야 합니다.');
  if(a.jumpEnabled&&a.distribution!=='normal')throw new Error('자료 기반 Jump는 로그정규 모형에서 사용합니다. Student-t에서는 Jump를 꺼 주세요.');
  if(a.jumpEnabled&&a.regimeEnabled)for(const state of REGIMES)decomposeJumps(a.regimes[state].btcMean,a.regimes[state].btcVolatility,JUMP_CALIBRATION[state],a.jumpIntensity);

}
// Marsaglia–Tsang gamma sampler, shape=df/2 > 1. Chi-square(df)=2*Gamma(df/2,1).
export function chiSquared(df:number,uniform:()=>number,normal:()=>number):number {
  const d=df/2-1/3,c=1/Math.sqrt(9*d);
  for(;;){
    const x=normal(),root=1+c*x;
    if(root<=0)continue;
    const v=root**3,u=uniform();
    if(u<1-.0331*x**4||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return 2*d*v;
  }
}
export function sampleShock(distribution:MarketAssumptions['distribution'],df:number,uniform:()=>number,normal:()=>number):number {
  const shock=normal();
  // Student-t is standardized to variance 1 before the loss floor is applied.
  return distribution==='studentT'?shock*Math.sqrt((df-2)/chiSquared(df,uniform,normal)):shock;
}
export function nextRegime(current:Regime,transitions:MarketAssumptions['transitions'],u:number):Regime {
  let cumulative=0;
  for(const state of REGIMES){cumulative+=transitions[current][state]/100;if(u<cumulative)return state;}
  return 'bear';
}
export interface JumpPlan {calibration:JumpCalibration;intensity:number;residualLogMean:number;residualVariance:number;jumpLogMean:number;jumpVariance:number}
export function decomposeJumps(meanReturn:number,volatility:number,calibration:JumpCalibration,intensity:number):JumpPlan {
  const average=(xs:number[],f:(x:number)=>number)=>xs.length?xs.reduce((s,x)=>s+f(x),0)/xs.length:0;
  const down=calibration.crashAnnualRate*intensity,up=calibration.maniaAnnualRate*intensity;
  const jumpLogMean=down*average(calibration.crashLogMoves,x=>x)+up*average(calibration.maniaLogMoves,x=>x);
  const jumpVariance=down*average(calibration.crashLogMoves,x=>x*x)+up*average(calibration.maniaLogMoves,x=>x*x);
  const totalVariance=(volatility/100)**2,residualVariance=totalVariance-jumpVariance;
  if(residualVariance < -1e-12)throw new Error('총 변동성보다 Jump 변동성이 큽니다. Jump 빈도 배율을 낮추거나 총 변동성을 높여 주세요.');
  return {calibration,intensity,residualLogMean:Math.log1p(meanReturn/100)-totalVariance/2-jumpLogMean,residualVariance:Math.max(0,residualVariance),jumpLogMean,jumpVariance};
}
export function poissonCount(rate:number,random:()=>number):number {
  if(!Number.isFinite(rate)||rate<0||rate>500)throw new Error('Jump 발생 빈도가 계산 범위를 벗어났습니다.');
  if(rate===0)return 0;
  // Sum independent Poisson chunks, avoiding exp(-rate) underflow.
  let remaining=rate,total=0;
  while(remaining>0){const chunk=Math.min(remaining,20),threshold=Math.exp(-chunk);let product=1,count=0;do{count++;product*=random();}while(product>threshold);total+=count-1;remaining-=chunk;}
  return total;
}
export function sampleCompoundJumps(plan:JumpPlan,random:()=>number):{logMove:number;crashes:number;manias:number} {
  const c=plan.calibration,crashes=poissonCount(c.crashAnnualRate*plan.intensity,random),manias=poissonCount(c.maniaAnnualRate*plan.intensity,random);
  let logMove=0;
  for(let i=0;i<crashes;i++)logMove+=c.crashLogMoves[Math.min(c.crashLogMoves.length-1,Math.floor(random()*c.crashLogMoves.length))];
  for(let i=0;i<manias;i++)logMove+=c.maniaLogMoves[Math.min(c.maniaLogMoves.length-1,Math.floor(random()*c.maniaLogMoves.length))];
  return {logMove,crashes,manias};
}
