import { defaultTamAdoption, validateTamAdoption, type TamAdoptionAssumptions } from './tam.ts';
export interface TamAdoptionInputs {curve:TamAdoptionAssumptions['curve'];targetYear:string;midpointYear:string;steepness:string}
export function defaultTamAdoptionInputs(startYear=2026,targetYear=2045):TamAdoptionInputs {
  const base=Math.max(2024,Math.min(2199,startYear));
  const end=Math.min(2200,Math.max(base+1,targetYear));
  return {curve:'sCurve',targetYear:String(end),midpointYear:String(base+(end-base)/2),steepness:String(defaultTamAdoption.steepness)};
}
export function parseTamAdoptionInputs(inputs:TamAdoptionInputs,startYear?:number):TamAdoptionAssumptions {
  if(!inputs||['targetYear','midpointYear','steepness'].some(key=>typeof inputs[key as keyof TamAdoptionInputs]!=='string'||inputs[key as keyof TamAdoptionInputs].trim()===''))throw new Error('TAM 채택 시점 가정을 모두 입력하세요.');
  const result={curve:inputs.curve,targetYear:Number(inputs.targetYear),midpointYear:Number(inputs.midpointYear),steepness:Number(inputs.steepness)};
  validateTamAdoption(result,startYear);return result;
}
