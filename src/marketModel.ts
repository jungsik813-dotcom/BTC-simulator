export const REGIMES=['riskOn','normal','crisis'] as const;
export type Regime=typeof REGIMES[number];
export const REGIME_LABELS:Record<Regime,string>={riskOn:'Risk-On',normal:'Normal',crisis:'Crisis'};
export interface RegimeAssumptions {btcMean:number;btcVolatility:number;stockMean:number;stockVolatility:number;correlation:number}
export interface MarketAssumptions {
  distribution:'normal'|'studentT';degreesOfFreedom:number;
  regimeEnabled:boolean;initialRegime:Regime;
  regimes:Record<Regime,RegimeAssumptions>;
  transitions:Record<Regime,Record<Regime,number>>;
  jumpEnabled:boolean;crashProbability:number;crashMagnitude:number;maniaProbability:number;maniaMagnitude:number;
}
export const STUDENT_MIN_FACTOR=.001;
export function defaultMarketAssumptions():MarketAssumptions {
  return {
    distribution:'normal',degreesOfFreedom:5,regimeEnabled:false,initialRegime:'normal',
    regimes:{riskOn:{btcMean:25,btcVolatility:65,stockMean:12,stockVolatility:22,correlation:.5},normal:{btcMean:10,btcVolatility:60,stockMean:7,stockVolatility:20,correlation:.35},crisis:{btcMean:-35,btcVolatility:85,stockMean:-20,stockVolatility:35,correlation:.75}},
    transitions:{riskOn:{riskOn:75,normal:20,crisis:5},normal:{riskOn:15,normal:80,crisis:5},crisis:{riskOn:10,normal:55,crisis:35}},
    jumpEnabled:false,crashProbability:3,crashMagnitude:30,maniaProbability:2,maniaMagnitude:50,
  };
}
export function validateMarket(a:MarketAssumptions):void {
  if(!a||!['normal','studentT'].includes(a.distribution))throw new Error('Normal 또는 Student-t 분포를 선택하세요.');
  if(!Number.isFinite(a.degreesOfFreedom)||a.degreesOfFreedom<=2||a.degreesOfFreedom>200)throw new Error('Student-t 자유도는 2 초과, 200 이하로 입력하세요.');
  if(typeof a.regimeEnabled!=='boolean'||typeof a.jumpEnabled!=='boolean'||!REGIMES.includes(a.initialRegime))throw new Error('시장 국면과 Jump 설정을 확인하세요.');
  for(const state of REGIMES){
    const r=a.regimes?.[state],row=a.transitions?.[state];
    if(!r||![r.btcMean,r.btcVolatility,r.stockMean,r.stockVolatility,r.correlation].every(Number.isFinite)||r.btcMean<=-100||r.stockMean<=-100||r.btcVolatility<0||r.stockVolatility<0||Math.abs(r.correlation)>1)throw new Error(`${REGIME_LABELS[state]}: 수익률은 -100% 초과, 변동성은 0 이상, 상관계수는 -1~1이어야 합니다.`);
    if(!row||REGIMES.some(key=>!Number.isFinite(row[key])||row[key]<0||row[key]>100)||Math.abs(REGIMES.reduce((sum,key)=>sum+row[key],0)-100)>1e-8)throw new Error(`${REGIME_LABELS[state]} 전이확률의 각 값은 0~100%, 행 합계는 100%여야 합니다.`);
  }
  if(![a.crashProbability,a.maniaProbability,a.crashMagnitude,a.maniaMagnitude].every(Number.isFinite)||a.crashProbability<0||a.maniaProbability<0||a.crashProbability+a.maniaProbability>100||a.crashMagnitude<0||a.crashMagnitude>=100||a.maniaMagnitude<0)throw new Error('Jump 확률은 각각 0 이상이며 합계 100% 이하, 급락 폭은 0 이상 100% 미만, 급등 폭은 0 이상이어야 합니다.');
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
export function correlatedShocks(distribution:MarketAssumptions['distribution'],df:number,rho:number,uniform:()=>number,normal:()=>number):[number,number] {
  const first=normal(),second=rho*first+Math.sqrt(Math.max(0,1-rho*rho))*normal();
  // Shared chi-square scale produces multivariate t shocks, standardized to variance 1.
  const scale=distribution==='studentT'?Math.sqrt((df-2)/chiSquared(df,uniform,normal)):1;
  return [first*scale,second*scale];
}
export function nextRegime(current:Regime,transitions:MarketAssumptions['transitions'],u:number):Regime {
  let cumulative=0;
  for(const state of REGIMES){cumulative+=transitions[current][state]/100;if(u<cumulative)return state;}
  return 'crisis';
}
export function sampleJump(a:MarketAssumptions,u:number):{factor:number;kind:'crash'|'mania'|'none'} {
  if(!a.jumpEnabled)return {factor:1,kind:'none'};
  if(u<a.crashProbability/100)return {factor:1-a.crashMagnitude/100,kind:'crash'};
  if(u<(a.crashProbability+a.maniaProbability)/100)return {factor:1+a.maniaMagnitude/100,kind:'mania'};
  return {factor:1,kind:'none'};
}
