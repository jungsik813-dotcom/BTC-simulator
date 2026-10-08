import { REGIMES, REGIME_LABELS, type Regime, type RegimeAssumptions, type MarketAssumptions } from './marketModel';
import { defaultMarketSettings, type MarketSettings } from './marketSettings';
import './marketModel.css';
const regimeFields:{key:keyof RegimeAssumptions;label:string}[]=[{key:'btcMean',label:'BTC 수익률 중심 (%)'},{key:'btcVolatility',label:'BTC 변동성 (%)'},{key:'stockMean',label:'QQQ 수익률 중심 (%)'},{key:'stockVolatility',label:'QQQ 변동성 (%)'},{key:'correlation',label:'BTC–QQQ 충격 상관계수'}];

export function MarketModelInputs({settings:s,onChange,baseReturns}:{settings:MarketSettings;onChange:(s:MarketSettings)=>void;baseReturns:{btcMean:number;stockMean:number}}) {
  const displayedReturn=(r:Regime,key:'btcMean'|'stockMean')=>r==='normal'?baseReturns[key]:((1+baseReturns[key]/100)*(1+Number(s.regimes[r][key])/100)/(1+Number(s.regimes.normal[key])/100)-1)*100;
  const editRegime=(r:Regime,key:keyof RegimeAssumptions,value:string)=>{
    const mean=key==='btcMean'||key==='stockMean';
    const stored=mean&&value.trim()!==''?String(((1+Number(value)/100)*(1+Number(s.regimes.normal[key])/100)/(1+baseReturns[key]/100)-1)*100):value;
    onChange({...s,regimes:{...s.regimes,[r]:{...s.regimes[r],[key]:stored}}});
  };
  const scalar=(key:keyof MarketSettings['inputs'],label:string,unit='%')=><label><span>{label}</span><div className="input-wrap"><input type="number" step="any" value={s.inputs[key]} onChange={e=>onChange({...s,inputs:{...s.inputs,[key]:e.target.value}})}/><span>{unit}</span></div></label>;
  return <div className="market-model">
    <div className="section-heading"><div><p className="eyebrow">FAT TAIL · MARKET REGIME · JUMP</p><h3>시장 움직임 가정</h3></div><button type="button" onClick={()=>onChange(defaultMarketSettings())}>시장 모형 기본값</button></div>
    <div className="mc-input-grid market-controls">
      <fieldset><legend>수익률 분포</legend><label><span>BTC · QQQ 공통</span><select value={s.distribution} onChange={e=>onChange({...s,distribution:e.target.value as MarketSettings['distribution']})}><option value="normal">Normal · 로그정규 가격</option><option value="studentT">Student-t · 단순수익률</option></select></label>{s.distribution==='studentT'&&scalar('degreesOfFreedom','자유도 df · 2 초과 200 이하','df')}<p className="muted">{s.distribution==='studentT'?'자유도가 작을수록 극단적 충격이 자주 발생합니다. 변동성은 절단 전 단순수익률의 표준편차입니다.':'STEP 7의 로그정규 가격 모형입니다. 변동성은 연 로그수익률 표준편차입니다.'}</p></fieldset>
      <fieldset><legend>시장 국면</legend><label className="check-label"><input type="checkbox" checked={s.regimeEnabled} onChange={e=>onChange({...s,regimeEnabled:e.target.checked})}/>Markov 국면 전환 사용</label>{s.regimeEnabled&&<label><span>첫 투자 연도의 국면</span><select value={s.initialRegime} onChange={e=>onChange({...s,initialRegime:e.target.value as Regime})}>{REGIMES.map(r=><option key={r} value={r}>{REGIME_LABELS[r]}</option>)}</select></label>}<p className="muted">시작 연도에는 수익률을 적용하지 않습니다. 첫 투자 연도는 선택 국면을 사용하고, 그 다음 해부터 전이확률로 바뀝니다.</p></fieldset>
      <fieldset><legend>BTC Jump</legend><label className="check-label"><input type="checkbox" checked={s.jumpEnabled} onChange={e=>onChange({...s,jumpEnabled:e.target.checked})}/>급락 · 급등 이벤트 사용</label>{s.jumpEnabled&&<>{scalar('crashProbability','연 급락 확률')}{scalar('crashMagnitude','급락 폭 · 양수로 입력')}{scalar('maniaProbability','연 급등 확률')}{scalar('maniaMagnitude','급등 폭 · 양수로 입력')}</>}<p className="muted">한 해에 급락·급등·없음 중 하나를 추출합니다. 두 확률 합계는 100% 이하입니다. 수익률 반영 후 가격에 곱하며, BTC 상·하한은 마지막에 적용합니다.</p></fieldset>
    </div>
    {s.distribution==='studentT'&&<p className="mc-notice">Student-t의 기대수익률은 절단 전 분포의 중심입니다. BTC·QQQ 기본 수익률의 손실을 −99.9%에서 제한하므로 실제 평균은 달라질 수 있습니다. Jump는 그 이후 추가 적용됩니다. 하한 적용 횟수는 결과에서 확인할 수 있습니다.</p>}
    {s.regimeEnabled&&<>
      <p className="muted">Normal의 성장률은 상단 입력과 연동됩니다. Risk-On·Crisis는 Normal 대비 상대 조정을 유지하며, 상단 성장률을 바꾸면 함께 이동합니다. 국면별 변동성은 따로 적용합니다. 상관계수는 변환 전 충격에 적용하며 실제 자산 수익률 상관과 다를 수 있습니다.</p>
      <div className="mc-input-grid market-controls">{REGIMES.map(r=><fieldset key={r}><legend>{REGIME_LABELS[r]}</legend>{regimeFields.map(({key,label})=><label key={key}><span>{label}</span><input type="number" step="any" min={key==='correlation'?-1:undefined} max={key==='correlation'?1:undefined} disabled={r==='normal'&&(key==='btcMean'||key==='stockMean')} value={key==='btcMean'||key==='stockMean'?Number.isFinite(displayedReturn(r,key))?Number(displayedReturn(r,key).toFixed(6)):'':s.regimes[r][key]} onChange={e=>editRegime(r,key,e.target.value)}/></label>)}</fieldset>)}</div>
      <div className="table-scroll"><table className="transition-table"><caption>연간 전이확률 (%) · 행: 현재 국면 → 열: 다음 국면 · 각 행 합계 100%</caption><thead><tr><th>현재 → 다음</th>{REGIMES.map(r=><th key={r}>{REGIME_LABELS[r]}</th>)}<th>합계</th></tr></thead><tbody>{REGIMES.map(from=>{const total=REGIMES.reduce((sum,to)=>sum+Number(s.transitions[from][to]),0);const valid=REGIMES.every(to=>s.transitions[from][to].trim()!==''&&Number(s.transitions[from][to])>=0&&Number(s.transitions[from][to])<=100)&&Math.abs(total-100)<1e-8;return <tr key={from}><th>{REGIME_LABELS[from]}</th>{REGIMES.map(to=><td key={to}><input aria-label={`${REGIME_LABELS[from]}에서 ${REGIME_LABELS[to]} 전이확률 (%)`} aria-invalid={!valid} type="number" step="any" min="0" max="100" value={s.transitions[from][to]} onChange={e=>onChange({...s,transitions:{...s.transitions,[from]:{...s.transitions[from],[to]:e.target.value}}})}/></td>)}<td className={valid?'':'field-error'}>{Number.isFinite(total)?`${total.toFixed(2)}%`:'입력 확인'}{!valid&&' · 합계 100% 필요'}</td></tr>})}</tbody></table></div>
    </>}
    <p className="muted">모든 기본값은 설명용 가정입니다. 국면 전환·Jump를 끄고 Normal을 선택하면 기존 STEP 7과 같은 계산을 사용합니다. Student-t는 공통 충격 크기를 공유하므로 국면을 꺼 상관계수가 0이어도 두 자산의 극단적 움직임 크기는 독립이 아닙니다.</p>
  </div>;
}

export function MarketSnapshot({market:a}:{market:MarketAssumptions}) {
  return <div><p>분포: {a.distribution==='normal'?'Normal (로그정규 가격)':`Student-t · df ${a.degreesOfFreedom} · 단순수익률 하한 −99.9%`}</p><p>시장 국면: {a.regimeEnabled?`사용 · 첫 투자 연도 ${REGIME_LABELS[a.initialRegime]}`:'사용 안 함'} / Jump: {a.jumpEnabled?`급락 확률 ${a.crashProbability}% · 폭 −${a.crashMagnitude}%, 급등 확률 ${a.maniaProbability}% · 폭 +${a.maniaMagnitude}%`:'사용 안 함'}</p>{a.regimeEnabled&&<ul className="notes">{REGIMES.map(r=><li key={r}>{REGIME_LABELS[r]}: BTC 중심 {a.regimes[r].btcMean}% · 변동성 {a.regimes[r].btcVolatility}%, QQQ 중심 {a.regimes[r].stockMean}% · 변동성 {a.regimes[r].stockVolatility}%, 상관계수 {a.regimes[r].correlation}. 다음 국면 {REGIMES.map(to=>`${REGIME_LABELS[to]} ${a.transitions[r][to]}%`).join(' / ')}</li>)}</ul>}</div>;
}
