export const TAM_ASSETS = [
  { key: 'gold', label: 'Financial Gold' },
  { key: 'bonds', label: 'Bonds' },
  { key: 'equities', label: 'Equities' },
  { key: 'realEstate', label: 'Real Estate' },
  { key: 'cash', label: 'Cash / Deposits' },
] as const;

export type TamAssetKey = typeof TAM_ASSETS[number]['key'];
export interface TamAssetAssumption { marketSizeTrillionKrw: number; growthRate: number; competingShare: number; penetration: number }
export type TamAssumptions = Record<TamAssetKey, TamAssetAssumption>;
export interface TamAdoptionAssumptions {curve:'sCurve'|'linear';targetYear:number;midpointYear:number;steepness:number}
export const defaultTamAdoption:TamAdoptionAssumptions={curve:'sCurve',targetYear:2045,midpointYear:2035.5,steepness:8};
export interface TamPathOptions {initialPrice:number;adoption:TamAdoptionAssumptions}
export interface TamContribution { key: TamAssetKey; label: string; futureMarket: number; addressableMarket: number; capturedValue: number; initialPenetration:number; penetration:number; targetPenetration:number }
export interface TamYearResult { year: number; totalMarket: number; addressableMarket: number; marketCap: number; btcSupply: number; btcPrice: number; contributions: TamContribution[]; adoptionProgress:number; targetMarketCap:number; targetBtcPrice:number; initialPenetration:number }

export const defaultTamAssumptions: TamAssumptions = {
  gold: { marketSizeTrillionKrw: 25000, growthRate: 4, competingShare: 50, penetration: 10 },
  bonds: { marketSizeTrillionKrw: 190000, growthRate: 3, competingShare: 10, penetration: 5 },
  equities: { marketSizeTrillionKrw: 170000, growthRate: 5, competingShare: 5, penetration: 5 },
  realEstate: { marketSizeTrillionKrw: 500000, growthRate: 4, competingShare: 2, penetration: 3 },
  cash: { marketSizeTrillionKrw: 170000, growthRate: 3, competingShare: 5, penetration: 4 },
};

const HALVING_2024 = Date.UTC(2024, 3, 20);
const SUPPLY_AT_HALVING_2024 = 19_687_500;
const BLOCK_MS = 10 * 60 * 1000;
const BLOCKS_PER_ERA = 210_000;

/** 연말 기준 공급량 근사치. 2024 반감기 이후 10분 블록과 210,000블록 반감기를 사용한다. */
export function btcSupplyAtYear(year: number): number {
  if (!Number.isInteger(year) || year < 2024 || year > 2200) throw new Error('BTC 공급량 연도는 2024~2200 범위여야 합니다.');
  let blocks = Math.max(0, Math.floor((Date.UTC(year + 1, 0, 1) - HALVING_2024) / BLOCK_MS));
  let supply = SUPPLY_AT_HALVING_2024;
  let reward = 3.125;
  while (blocks > 0 && reward > 0) {
    const eraBlocks = Math.min(blocks, BLOCKS_PER_ERA);
    supply += eraBlocks * reward;
    blocks -= eraBlocks;
    reward /= 2;
  }
  return Math.min(21_000_000, supply);
}

export function validateTamAssumptions(assumptions: TamAssumptions): void {
  for (const asset of TAM_ASSETS) {
    const a = assumptions[asset.key];
    if (!a || !Object.values(a).every(Number.isFinite)) throw new Error(`${asset.label} 가정을 모두 숫자로 입력해 주세요.`);
    if (a.marketSizeTrillionKrw < 0) throw new Error(`${asset.label} 시장 규모는 음수일 수 없습니다.`);
    if (a.growthRate <= -100) throw new Error(`${asset.label} 성장률은 -100%보다 커야 합니다.`);
    if (a.competingShare < 0 || a.competingShare > 100 || a.penetration < 0 || a.penetration > 100) throw new Error(`${asset.label} 비율은 0~100% 범위여야 합니다.`);
  }
}

export function validateTamAdoption(a:TamAdoptionAssumptions,startYear?:number):void {
  if(!a||!['sCurve','linear'].includes(a.curve))throw new Error('TAM 채택 곡선을 선택하세요.');
  if(!Number.isInteger(a.targetYear)||a.targetYear<2025||a.targetYear>2200||!Number.isFinite(a.midpointYear)||(a.curve==='sCurve'&&(a.midpointYear<2024||a.midpointYear>=a.targetYear))||!Number.isFinite(a.steepness)||a.steepness<1||a.steepness>20)throw new Error('TAM 목표 연도는 2025~2200년, 가속 중심은 목표 연도 이전, S곡선 강도는 1~20이어야 합니다.');
  if(startYear!==undefined&&(a.targetYear<=startYear||(a.curve==='sCurve'&&a.midpointYear<=startYear)))throw new Error('TAM 목표 연도는 시작 연도 이후여야 하며 S곡선 가속 중심은 두 연도 사이여야 합니다.');
}

/** 시작=0, 목표 연도=1로 정규화한 logistic. 조회 종료 연도와 무관하다. */
export function adoptionProgress(year:number,startYear:number,a:TamAdoptionAssumptions):number {
  validateTamAdoption(a,startYear);
  if(year<=startYear)return 0;
  if(year>=a.targetYear)return 1;
  const duration=a.targetYear-startYear,x=(year-startYear)/duration;
  if(a.curve==='linear')return x;
  const center=(a.midpointYear-startYear)/duration;
  const logistic=(position:number)=>1/(1+Math.exp(-a.steepness*(position-center)));
  return Math.max(0,Math.min(1,(logistic(x)-logistic(0))/(logistic(1)-logistic(0))));
}

function calculateYear(year:number,startYear:number,assumptions:TamAssumptions,options:TamPathOptions,initialPenetration:number):TamYearResult {
  const elapsed = year - startYear;
  const progress=adoptionProgress(year,startYear,options.adoption);
  const contributions = TAM_ASSETS.map(asset => {
    const a = assumptions[asset.key];
    const futureMarket = a.marketSizeTrillionKrw * 1_000_000_000_000 * (1 + a.growthRate / 100) ** elapsed;
    const addressableMarket = futureMarket * a.competingShare / 100;
    const penetration=initialPenetration+(a.penetration-initialPenetration)*progress;
    const capturedValue = addressableMarket * penetration / 100;
    return { key: asset.key, label: asset.label, futureMarket, addressableMarket, capturedValue, initialPenetration, penetration, targetPenetration:a.penetration };
  });
  const totalMarket = contributions.reduce((sum, row) => sum + row.futureMarket, 0);
  const addressableMarket = contributions.reduce((sum, row) => sum + row.addressableMarket, 0);
  const marketCap = year===startYear?options.initialPrice*btcSupplyAtYear(startYear):contributions.reduce((sum, row) => sum + row.capturedValue, 0);
  const targetMarketCap=contributions.reduce((sum,row)=>sum+row.addressableMarket*row.targetPenetration/100,0);
  if (![totalMarket, addressableMarket, marketCap,targetMarketCap].every(Number.isFinite)) throw new Error('TAM 계산 범위를 벗어났습니다. 시장 규모나 성장률을 줄여 주세요.');
  const btcSupply = btcSupplyAtYear(year);
  return { year, totalMarket, addressableMarket, marketCap, btcSupply, btcPrice:year===startYear?options.initialPrice:marketCap/btcSupply, contributions, adoptionProgress:progress,targetMarketCap,targetBtcPrice:targetMarketCap/btcSupply,initialPenetration };
}

export function calculateTamRange(startYear: number, endYear: number, assumptions: TamAssumptions,options:TamPathOptions): TamYearResult[] {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 2024 || endYear > 2200 || endYear < startYear) throw new Error('TAM 연도 범위를 확인해 주세요.');
  validateTamAssumptions(assumptions);validateTamAdoption(options.adoption,startYear);
  if(!Number.isFinite(options.initialPrice)||options.initialPrice<=0)throw new Error('TAM 출발 BTC 현재가는 0보다 커야 합니다.');
  const initialCap=options.initialPrice*btcSupplyAtYear(startYear);
  const initialAddressable=TAM_ASSETS.reduce((sum,{key})=>sum+assumptions[key].marketSizeTrillionKrw*1e12*assumptions[key].competingShare/100,0);
  if(!Number.isFinite(initialAddressable)||initialAddressable<=0||!Number.isFinite(initialCap))throw new Error('현재가를 연결하려면 경쟁 가능 TAM이 0보다 크고 계산 가능한 범위여야 합니다.');
  // 현재 시가총액을 각 자산의 경쟁 가능 시장 규모에 비례 배분한다. 목표 침투율과 독립적이다.
  const initialPenetration=initialCap/initialAddressable*100;
  if(initialPenetration>100)throw new Error('현재 BTC 시가총액이 경쟁 가능 TAM보다 큽니다. 시장 규모·경쟁 가능 비율 또는 현재가를 확인하세요.');
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => calculateYear(startYear + index, startYear, assumptions,options,initialPenetration));
}

export function calculateTamYear(year:number,startYear:number,assumptions:TamAssumptions,options:TamPathOptions):TamYearResult {
  return calculateTamRange(startYear,year,assumptions,options).at(-1)!;
}
