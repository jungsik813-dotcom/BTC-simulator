import { useEffect, useRef, useState } from 'react';

// Measure the card rather than the viewport: charts also live in narrow desktop columns.
export function useChartLayout(defaultWidth:number,defaultHeight:number,defaultLeft:number) {
  const ref=useRef<HTMLDivElement>(null);
  const [measuredWidth,setMeasuredWidth]=useState(defaultWidth);
  useEffect(()=>{
    const element=ref.current;
    if(!element)return;
    const update=()=>{const width=element.getBoundingClientRect().width;if(width>0)setMeasuredWidth(width)};
    update();
    const observer=new ResizeObserver(update);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  const compact=measuredWidth<600;
  return {ref,width:Math.max(200,measuredWidth),height:compact?280:defaultHeight,left:compact?78:defaultLeft,right:compact?20:25,top:25,bottom:45};
}
