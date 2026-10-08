import { useState, type ReactNode } from 'react';
import './interactiveChart.css';

export interface ChartDatum {year:number;entries:{label:string;value:string;color:string;y?:number|null}[]}
export function InteractiveChart({width,height,left,right,top,bottom,label,data,children,onSelect}:{width:number;height:number;left:number;right:number;top:number;bottom:number;label:string;data:ChartDatum[];children:ReactNode;onSelect?:(year:number)=>void}) {
  const [hovered,setHovered]=useState<number|null>(null),[pinned,setPinned]=useState<number|null>(null);
  const pinIndex=data.findIndex(row=>row.year===pinned),hoverIndex=data.findIndex(row=>row.year===hovered);
  const index=pinIndex>=0?pinIndex:hoverIndex,row=data[index];
  const x=(i:number)=>left+i/Math.max(1,data.length-1)*(width-left-right);
  const step=(width-left-right)/Math.max(1,data.length-1);
  const select=(year:number)=>{setPinned(old=>old===year?null:year);setHovered(year);onSelect?.(year)};
  const clear=()=>{setPinned(null);setHovered(null)};
  const tooltipWidth=Math.min(320,width-left-right),tooltipHeight=Math.min(height-top-bottom,60+(row?.entries.length??0)*30);
  const tooltipX=row?Math.max(left,Math.min(width-right-tooltipWidth,x(index)+(x(index)>width/2?-tooltipWidth-14:14))):left;
  return <div className="interactive-chart">
    <div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label} onPointerLeave={()=>setHovered(null)} onKeyDown={e=>{if(e.key==='Escape')clear()}}>
      <g className="chart-art">{children}</g>
      {row&&<g pointerEvents="none"><line x1={x(index)} x2={x(index)} y1={top} y2={height-bottom} stroke="#709682" strokeDasharray="4 4"/>{row.entries.map((entry,i)=>entry.y==null?null:<circle key={i} cx={x(index)} cy={entry.y} r="5" fill={entry.color} stroke="#fff" strokeWidth="2"/>)}</g>}
      {data.map((datum,i)=>{const start=data.length===1?left:Math.max(left,x(i)-step/2),end=data.length===1?width-right:Math.min(width-right,x(i)+step/2);return <rect key={datum.year} className="chart-hit-area" x={start} y={top} width={end-start} height={height-top-bottom} fill="transparent" role="button" tabIndex={0} aria-label={`${datum.year}년: ${datum.entries.map(entry=>`${entry.label} ${entry.value}`).join(', ')}. 선택하여 고정`} aria-pressed={pinIndex===i} onPointerEnter={e=>{if(e.pointerType!=='touch')setHovered(datum.year)}} onPointerMove={e=>{if(e.pointerType!=='touch')setHovered(datum.year)}} onFocus={()=>setHovered(datum.year)} onBlur={()=>setHovered(null)} onClick={()=>select(datum.year)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(datum.year)}}}/>})}
      {row&&<foreignObject x={tooltipX} y={top+4} width={tooltipWidth} height={tooltipHeight} pointerEvents="none" aria-hidden="true"><div className="chart-tooltip"><div className="chart-tooltip-heading"><b>{row.year}년</b><span>{pinIndex>=0?'선택 고정':'클릭하면 고정'}</span></div>{row.entries.map((entry,i)=><div className="chart-tooltip-row" key={i}><span><i style={{background:entry.color}}/>{entry.label}</span><strong>{entry.value}</strong></div>)}</div></foreignObject>}
    </svg></div>
    <div className="chart-interaction-hint"><span>{pinIndex>=0?`${data[pinIndex].year}년 값을 고정해서 보고 있습니다.`:'마우스를 올리면 값 확인 · 클릭하거나 터치하면 선택 고정'}</span>{pinIndex>=0&&<button type="button" onClick={clear}>선택 해제</button>}</div>
  </div>;
}
