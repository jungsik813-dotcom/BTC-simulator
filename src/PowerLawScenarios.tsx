import { InteractiveChart } from './InteractiveChart';
import { type YearResult } from './simulation';
import { compactKrw, formatMoney } from './settings';

export function PowerLawScenarios({rows,metric,onMetricChange}:{rows:YearResult[];metric:'nominal'|'real';onMetricChange:(metric:'nominal'|'real')=>void}) {
  const width=900,height=330,left=100,right=25,top=25,bottom=45;
  const minimum=Math.min(0,...rows.map(r=>r[metric])),maximum=Math.max(1,...rows.map(r=>r[metric]));
  const x=(i:number)=>left+i/Math.max(1,rows.length-1)*(width-left-right);
  const y=(v:number)=>top+(maximum-v)/(maximum-minimum)*(height-top-bottom);
  return <>
    <div className="segment" role="group" aria-label="Power Law 금액 기준"><button className={metric==='nominal'?'active':''} aria-pressed={metric==='nominal'} onClick={()=>onMetricChange('nominal')}>예상 순자산</button><button className={metric==='real'?'active':''} aria-pressed={metric==='real'} onClick={()=>onMetricChange('real')}>물가 반영 순자산</button></div>
    <p className="muted">연도 기준: 각 연도 1월 1일(연초), UTC 기준입니다.</p>
    <InteractiveChart width={width} height={height} left={left} right={right} top={top} bottom={bottom} label="현재가 기준 Power Law 순자산 성장 경로" data={rows.map(r=>({year:r.year,entries:[{label:metric==='real'?'물가 반영 순자산':'예상 순자산',value:formatMoney(r[metric]).replace(' KRW','원'),color:'#246957',y:y(r[metric])},{label:'BTC 가격',value:formatMoney(r.btcPrice).replace(' KRW','원'),color:'#246957',y:null},{label:'BTC 수량',value:r.btcQuantity.toFixed(8)+' BTC',color:'#246957',y:null}]}))}>
      {[0,1,2,3,4].map(i=>{const v=minimum+(maximum-minimum)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#e5e9ee"/><text x={left-12} y={y(v)+4} textAnchor="end">{compactKrw(v)}</text></g>})}
      <polyline points={rows.map((r,i)=>[x(i),y(r[metric])].join(',')).join(' ')} fill="none" stroke="#246957" strokeWidth={3}/>
      {rows.map((r,i)=><circle key={r.year} cx={x(i)} cy={y(r[metric])} r="3" fill="#246957"/>)}
      {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y={height-12} textAnchor="middle">{rows[i].year}</text>)}
    </InteractiveChart>
    <div className="ui-chart-legend"><span><i style={{background:'#246957'}}/>{metric==='real'?'물가 반영 순자산':'예상 순자산'}</span></div>
    <p className="muted">시작 금액은 입력한 현재 가격 기준입니다. 베타는 이후 성장 곡선을 조절합니다. 매수와 평가에 같은 BTC 가격을 사용합니다.</p>
    <details className="ui-inline-disclosure"><summary>연도별 자세한 금액</summary><div className="table-scroll"><table><thead><tr><th>연도 (연초)</th><th>BTC 가격</th><th>BTC 수량</th><th>BTC 평가액</th><th>주식</th><th>현금</th><th>부채</th><th>순자산</th><th>물가 반영 순자산</th></tr></thead><tbody>{rows.map(r=><tr key={r.year}><th>{r.year}</th><td>{formatMoney(r.btcPrice)}</td><td>{r.btcQuantity.toFixed(8)}</td>{[r.btcValue,r.stocks,r.cash,r.debt,r.nominal,r.real].map((v,i)=><td key={i}>{formatMoney(v)}</td>)}</tr>)}</tbody></table></div></details>
  </>;
}
