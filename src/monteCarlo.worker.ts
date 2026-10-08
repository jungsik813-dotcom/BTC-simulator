import { runMonteCarlo, type MonteCarloRequest, type MonteCarloMessage } from './monteCarlo';

const send=(message:MonteCarloMessage)=>self.postMessage(message);
self.onmessage=(event:MessageEvent<MonteCarloRequest>)=>{
  try {
    const result=runMonteCarlo(event.data,percent=>send({type:'progress',percent}));
    send({type:'result',result});
  }catch(error){send({type:'error',message:error instanceof Error?error.message:'시뮬레이션 실행에 실패했습니다.'});}
};
