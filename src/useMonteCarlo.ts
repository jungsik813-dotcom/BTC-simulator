import { useEffect, useRef, useState } from 'react';
import { parseInputs, type Inputs } from './settings';
import { makeMonteCarloRequest, type MonteCarloSettings } from './monteCarloSettings';
import { validateMonteCarloRequest, type MonteCarloMessage, type MonteCarloRequest, type MonteCarloResult } from './monteCarlo';

export interface CompletedSimulation {result:MonteCarloResult;request:MonteCarloRequest}
export function useMonteCarlo(portfolio:Inputs,settings:MonteCarloSettings) {
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const [completed,setCompleted]=useState<CompletedSimulation|null>(null);
  const workerRef=useRef<Worker|null>(null);
  useEffect(()=>()=>workerRef.current?.terminate(),[]);
  let current:MonteCarloRequest|undefined,validation='';
  try{current=makeMonteCarloRequest(parseInputs(portfolio),settings);validateMonteCarloRequest(current)}catch(e){validation=(e as Error).message}
  const stale=!!completed&&JSON.stringify(current)!==JSON.stringify(completed.request);
  function run(){
    if(!current||validation)return;
    const request=current;
    workerRef.current?.terminate();setError('');setProgress(0);setBusy(true);
    try{
      const worker=new Worker(new URL('./monteCarlo.worker.ts',import.meta.url),{type:'module'});workerRef.current=worker;
      const finish=()=>{worker.terminate();workerRef.current=null;setBusy(false)};
      worker.onmessage=(event:MessageEvent<MonteCarloMessage>)=>{
        if(workerRef.current!==worker)return;
        const message=event.data;
        if(message.type==='progress')setProgress(message.percent);
        else if(message.type==='result'){setCompleted({result:message.result,request});setProgress(100);finish()}
        else{setError(message.message);finish()}
      };
      worker.onerror=()=>{if(workerRef.current!==worker)return;setError('계산 작업을 실행하지 못했습니다. 새로고침 후 다시 실행해 주세요.');finish()};
      worker.postMessage(request);
    }catch{workerRef.current?.terminate();workerRef.current=null;setBusy(false);setError('이 브라우저에서 계산 작업을 시작하지 못했습니다.')}
  }
  function cancel(){workerRef.current?.terminate();workerRef.current=null;setBusy(false);setError('계산을 취소했습니다. 이전 완료 결과가 있다면 유지됩니다.')}
  return {busy,progress,error,completed,current,validation,stale,run,cancel};
}
