import { InteractiveChart } from './InteractiveChart';
import { type YearResult } from './simulation';
import { useCurrency } from './CurrencyProvider';

export function BtcChart({rows}:{rows:YearResult[]}) {
  const display=useCurrency();
  const width=900,height=330,left=100,right=25,top=25,bottom=45;
  const minimum=Math.min(0,...rows.map(r=>r.btcValue)),maximum=Math.max(1,...rows.map(r=>r.btcValue));
  const x=(i:number)=>left+i/Math.max(1,rows.length-1)*(width-left-right);
  const y=(v:number)=>top+(maximum-v)/(maximum-minimum)*(height-top-bottom);
  return <>
    <InteractiveChart width={width} height={height} left={left} right={right} top={top} bottom={bottom} label="연도별 BTC 평가액 성장 경로" data={rows.map(r=>({year:r.year,entries:[{label:'BTC 평가액',value:display.money(r.btcValue).replace(' KRW','원'),color:'#246957',y:y(r.btcValue)},{label:'BTC 가격',value:display.money(r.btcPrice).replace(' KRW','원'),color:'#246957',y:null},{label:'BTC 수량',value:r.btcQuantity.toFixed(8)+' BTC',color:'#246957',y:null}]}))}>
      {[0,1,2,3,4].map(i=>{const v=minimum+(maximum-minimum)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#e5e9ee"/><text x={left-12} y={y(v)+4} textAnchor="end">{display.compact(v)}</text></g>})}
      <polyline points={rows.map((r,i)=>[x(i),y(r.btcValue)].join(',')).join(' ')} fill="none" stroke="#246957" strokeWidth={3}/>
      {rows.map((r,i)=><circle key={r.year} cx={x(i)} cy={y(r.btcValue)} r="3" fill="#246957"/>)}
      {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y={height-12} textAnchor="middle">{rows[i].year}</text>)}
    </InteractiveChart>
    <div className="ui-chart-legend"><span><i style={{background:'#246957'}}/>{'BTC 평가액'}</span></div>
    <details className="ui-inline-disclosure"><summary>연도별 자세한 금액</summary><div className="table-scroll"><table><thead><tr><th>연도 (연초)</th><th>BTC 가격</th><th>BTC 수량</th><th>BTC 평가액</th></tr></thead><tbody>{rows.map(r=><tr key={r.year}><th>{r.year}</th><td>{display.money(r.btcPrice)}</td><td>{r.btcQuantity.toFixed(8)} BTC</td><td>{display.money(r.btcValue)}</td></tr>)}</tbody></table></div></details>
  </>;
}
