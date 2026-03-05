import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS & DATA
// ═══════════════════════════════════════════════════════════════════════
const GRID_RES = 6;
const W = 780, H = 480;

const WIRE_COLORS = {
  AC: {
    "Phase A": { code: "BK", hex: "#444", stroke: "#666", aci: 7 },
    "Phase B": { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
    "Phase C": { code: "BL", hex: "#2563eb", stroke: "#3b82f6", aci: 5 },
    Neutral:   { code: "WH", hex: "#d4d4d4", stroke: "#e5e5e5", aci: 9 },
    Ground:    { code: "GN", hex: "#16a34a", stroke: "#22c55e", aci: 3 },
    "Gnd Alt": { code: "GN/YL", hex: "#84cc16", stroke: "#a3e635", aci: 82 },
  },
  DC: {
    Positive:   { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
    Negative:   { code: "BK", hex: "#444", stroke: "#666", aci: 7 },
    "Pos Alt":  { code: "BL", hex: "#2563eb", stroke: "#3b82f6", aci: 5 },
    "Neg Alt":  { code: "WH", hex: "#d4d4d4", stroke: "#e5e5e5", aci: 9 },
    Ground:     { code: "GN", hex: "#16a34a", stroke: "#22c55e", aci: 3 },
    Return:     { code: "WH/BK", hex: "#9ca3af", stroke: "#9ca3af", aci: 8 },
  },
};

const NEC_DERATING = [
  [1,3,1],[4,6,.8],[7,9,.7],[10,20,.5],[21,30,.45],[31,40,.4],[41,999,.35]
];
const GAUGES = {
  "14 AWG":{a:.0097,amp:[15,20,25]},"12 AWG":{a:.0133,amp:[20,25,30]},
  "10 AWG":{a:.0211,amp:[30,35,40]},"8 AWG":{a:.0366,amp:[40,50,55]},
  "6 AWG":{a:.0507,amp:[55,65,75]},"4 AWG":{a:.0824,amp:[70,85,95]},
  "2 AWG":{a:.1158,amp:[95,115,130]},"1/0":{a:.1855,amp:[125,150,170]},
  "2/0":{a:.2223,amp:[145,175,195]},"4/0":{a:.3237,amp:[195,230,260]},
  "250 kcmil":{a:.397,amp:[215,255,290]},"500 kcmil":{a:.7073,amp:[320,380,430]},
};
const CONDUIT_AREAS = {
  "1/2 EMT":.304,"3/4 EMT":.533,"1 EMT":.864,"1-1/4 EMT":1.496,"1-1/2 EMT":2.036,
  "2 EMT":3.356,"2-1/2 EMT":5.858,"3 EMT":8.846,"4 EMT":15.901,
  "1/2 RGS":.314,"3/4 RGS":.533,"1 RGS":.887,"2 RGS":3.408,"3 RGS":9.521,"4 RGS":16.351,
  "1 PVC40":.887,"2 PVC40":3.291,"3 PVC40":8.09,"4 PVC40":14.753,
};

const OBS_STYLES = {
  foundation:{f:"#1a120a",s:"#8b5e3c",l:"#c08050"},
  building:{f:"#0e1220",s:"#3a5a8a",l:"#6a9aca"},
  equipment_pad:{f:"#0e1a0e",s:"#3a6a3a",l:"#5a9a5a"},
  trench:{f:"#060e1a",s:"#1a4a7a50",l:"#3a7aaa"},
  fence:{f:"none",s:"#3a3a3a",l:"#555"},
  road:{f:"#12100e",s:"#5a5040",l:"#8a7a60"},
};

const OBSTACLES = [
  {id:"FNDN-1",type:"foundation",x:100,y:50,w:80,h:65,label:"XFMR-1\nFoundation"},
  {id:"FNDN-2",type:"foundation",x:300,y:70,w:70,h:55,label:"BKR-1\nFoundation"},
  {id:"FNDN-3",type:"foundation",x:480,y:40,w:55,h:50,label:"CT/PT\nFNDN"},
  {id:"FNDN-4",type:"foundation",x:260,y:230,w:85,h:65,label:"XFMR-2\nFoundation"},
  {id:"FNDN-5",type:"foundation",x:500,y:200,w:60,h:55,label:"SW-1\nFNDN"},
  {id:"BLDG-1",type:"building",x:620,y:320,w:140,h:130,label:"CONTROL\nHOUSE"},
  {id:"PAD-1",type:"equipment_pad",x:80,y:265,w:55,h:38,label:"JB-1"},
  {id:"PAD-2",type:"equipment_pad",x:440,y:345,w:48,h:36,label:"JB-2"},
  {id:"ROAD-1",type:"road",x:0,y:440,w:620,h:30,label:"ACCESS ROAD"},
  {id:"TR-1",type:"trench",x:60,y:175,w:570,h:14,label:"TRENCH A"},
  {id:"TR-2",type:"trench",x:595,y:175,w:14,h:165,label:""},
  {id:"FENCE",type:"fence",x:8,y:8,w:762,h:462,label:""},
];

const EQUIP = [
  {id:"RP1",x:660,y:355,label:"RP1",color:"#f59e0b"},
  {id:"RP2",x:660,y:395,label:"RP2",color:"#3b82f6"},
  {id:"JB1",x:108,y:280,label:"JB-1",color:"#22c55e"},
  {id:"JB2",x:464,y:358,label:"JB-2",color:"#22c55e"},
  {id:"XFMR1",x:140,y:78,label:"XFMR-1",color:"#ef4444"},
  {id:"BKR1",x:335,y:92,label:"BKR-1",color:"#ef4444"},
  {id:"CTPT",x:508,y:60,label:"CT/PT",color:"#ef4444"},
  {id:"SW1",x:530,y:222,label:"SW-1",color:"#ef4444"},
  {id:"XFMR2",x:302,y:258,label:"XFMR-2",color:"#ef4444"},
];

// ═══════════════════════════════════════════════════════════════════════
// ROUTING ENGINE
// ═══════════════════════════════════════════════════════════════════════
function inflateObs(o,c){return{x:o.x-c,y:o.y-c,w:o.w+c*2,h:o.h+c*2}}
function ptInRect(px,py,r){return px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h}

function buildGrid(obstacles,clearance){
  const cols=Math.ceil(W/GRID_RES),rows=Math.ceil(H/GRID_RES);
  const g=Array.from({length:rows},()=>new Float32Array(cols));
  for(const o of obstacles){
    if(o.type==="trench"||o.type==="fence")continue;
    const z=inflateObs(o,clearance);
    const x0=Math.max(0,Math.floor(z.x/GRID_RES)),y0=Math.max(0,Math.floor(z.y/GRID_RES));
    const x1=Math.min(cols-1,Math.ceil((z.x+z.w)/GRID_RES)),y1=Math.min(rows-1,Math.ceil((z.y+z.h)/GRID_RES));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)g[y][x]=999;
    const sz=inflateObs(o,clearance*1.6);
    const sx0=Math.max(0,Math.floor(sz.x/GRID_RES)),sy0=Math.max(0,Math.floor(sz.y/GRID_RES));
    const sx1=Math.min(cols-1,Math.ceil((sz.x+sz.w)/GRID_RES)),sy1=Math.min(rows-1,Math.ceil((sz.y+sz.h)/GRID_RES));
    for(let y=sy0;y<=sy1;y++)for(let x=sx0;x<=sx1;x++){
      if(g[y][x]>=999)continue;
      const px=x*GRID_RES,py=y*GRID_RES;
      if(ptInRect(px,py,sz)&&!ptInRect(px,py,z))g[y][x]=Math.max(g[y][x],1.5);
    }
  }
  for(const o of obstacles){
    if(o.type!=="trench")continue;
    const x0=Math.max(0,Math.floor(o.x/GRID_RES)),y0=Math.max(0,Math.floor(o.y/GRID_RES));
    const x1=Math.min(cols-1,Math.ceil((o.x+o.w)/GRID_RES)),y1=Math.min(rows-1,Math.ceil((o.y+o.h)/GRID_RES));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(g[y][x]<999)g[y][x]=-0.6;
  }
  return{grid:g,cols,rows};
}

function astar(sp,ep,cost,tp=4){
  const{grid:g,cols,rows}=cost;
  const sx=Math.round(sp.x/GRID_RES),sy=Math.round(sp.y/GRID_RES);
  const ex=Math.round(ep.x/GRID_RES),ey=Math.round(ep.y/GRID_RES);
  const k=(x,y)=>y*cols+x,h=(x,y)=>Math.abs(x-ex)+Math.abs(y-ey);
  const open=[{x:sx,y:sy,g:0,f:h(sx,sy),px:-1,py:-1}];
  const gM=new Map(),par=new Map(),cl=new Set();
  gM.set(k(sx,sy),0);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  let it=0;
  while(open.length>0&&it<55000){
    it++;open.sort((a,b)=>a.f-b.f);
    const c=open.shift(),ck=k(c.x,c.y);
    if(cl.has(ck))continue;cl.add(ck);
    if(c.x===ex&&c.y===ey){
      const p=[];let kk=ck;
      while(kk!==undefined){const x=kk%cols,y=Math.floor(kk/cols);p.unshift({x:x*GRID_RES,y:y*GRID_RES});kk=par.get(kk)}
      p[0]=sp;p[p.length-1]=ep;return simplify(p);
    }
    for(const[dx,dy]of dirs){
      const nx=c.x+dx,ny=c.y+dy;
      if(nx<0||nx>=cols||ny<0||ny>=rows)continue;
      const nk=k(nx,ny);if(cl.has(nk))continue;
      const cv=g[ny]?.[nx]??0;if(cv>=999)continue;
      let mc=1+Math.max(0,cv*2.5);mc-=Math.min(0,cv);mc=Math.max(.1,mc);
      if(c.px>=0){const pdx=c.x-c.px,pdy=c.y-c.py;if(pdx!==dx||pdy!==dy)mc+=tp}
      const tg=c.g+mc,eg=gM.get(nk);
      if(eg===undefined||tg<eg){gM.set(nk,tg);par.set(nk,ck);open.push({x:nx,y:ny,g:tg,f:tg+h(nx,ny),px:c.x,py:c.y})}
    }
  }
  const mx=(sp.x+ep.x)/2;
  return[sp,{x:mx,y:sp.y},{x:mx,y:ep.y},ep];
}

function simplify(p){
  if(p.length<=2)return p;
  const o=[p[0]];
  for(let i=1;i<p.length-1;i++){
    const pr=o[o.length-1],c=p[i],n=p[i+1];
    if(Math.sign(c.x-pr.x)!==Math.sign(n.x-c.x)||Math.sign(c.y-pr.y)!==Math.sign(n.y-c.y))o.push(c);
  }
  o.push(p[p.length-1]);return o;
}

function pathSvg(p){
  if(!p||p.length<2)return"";
  let d=`M${p[0].x} ${p[0].y}`;
  for(let i=1;i<p.length-1;i++){
    const pv=p[i-1],c=p[i],n=p[i+1];
    const d1x=Math.sign(c.x-pv.x),d1y=Math.sign(c.y-pv.y);
    const d2x=Math.sign(n.x-c.x),d2y=Math.sign(n.y-c.y);
    if(d1x===d2x&&d1y===d2y){d+=` L${c.x} ${c.y}`}
    else{const r=5;d+=` L${c.x-d1x*r} ${c.y-d1y*r} A${r} ${r} 0 0 ${(d1x*d2y-d1y*d2x)>0?1:0} ${c.x+d2x*r} ${c.y+d2y*r}`}
  }
  d+=` L${p[p.length-1].x} ${p[p.length-1].y}`;return d;
}

function pathLen(p){let l=0;for(let i=1;i<p.length;i++)l+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);return l}
function pathBends(p){let b=0;for(let i=2;i<p.length;i++){const dx1=Math.sign(p[i-1].x-p[i-2].x),dy1=Math.sign(p[i-1].y-p[i-2].y),dx2=Math.sign(p[i].x-p[i-1].x),dy2=Math.sign(p[i].y-p[i-1].y);if(dx1!==dx2||dy1!==dy2)b++}return b}

function tagPlacement(p){
  if(p.length<2)return{pos:p[0]||{x:0,y:0},angle:0};
  let best={len:0,i:0};
  for(let i=0;i<p.length-1;i++){const l=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);if(l>best.len)best={len:l,i}}
  const a=p[best.i],b=p[best.i+1];
  let ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  if(ang>90)ang-=180;if(ang<-90)ang+=180;
  return{pos:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},angle:ang};
}

// ═══════════════════════════════════════════════════════════════════════
// NEC CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════
function getDerate(n){for(const[lo,hi,f]of NEC_DERATING)if(n>=lo&&n<=hi)return f;return .35}
function getTempCorr(t){if(t<=30)return 1;if(t<=35)return .94;if(t<=40)return .88;if(t<=45)return .82;if(t<=50)return .75;if(t<=55)return .67;return .58}

// ═══════════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════════
const TABS = [
  {id:"route",icon:"◫",label:"Route"},
  {id:"schedule",icon:"☰",label:"Schedule"},
  {id:"nec",icon:"⚡",label:"NEC Calc"},
  {id:"section",icon:"⊟",label:"Section Cuts"},
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function ConduitRoute() {
  const [tab,setTab]=useState("route");
  const [mode,setMode]=useState("plan_view");
  const [cableType,setCableType]=useState("DC");
  const [wireFn,setWireFn]=useState("Positive");
  const [clearance,setClearance]=useState(18);
  const [showClearance,setShowClearance]=useState(true);
  const [showGrid,setShowGrid]=useState(false);
  const [showHeat,setShowHeat]=useState(false);
  const [routes,setRoutes]=useState([]);
  const [nextRef,setNextRef]=useState(1);
  const [picking,setPicking]=useState(null);
  const [hover,setHover]=useState(null);
  const [selectedRoute,setSelectedRoute]=useState(null);
  // NEC state
  const [necWires,setNecWires]=useState([{gauge:"12 AWG",count:6},{gauge:"10 AWG",count:3}]);
  const [necConduit,setNecConduit]=useState("2 EMT");
  const [necTemp,setNecTemp]=useState(30);
  // Section cut state
  const [sectionType,setSectionType]=useState("stub_up");
  // Status
  const [statusMsg,setStatusMsg]=useState("Ready");
  const svgRef=useRef(null);
  const [time,setTime]=useState(Date.now());

  useEffect(()=>{const t=setInterval(()=>setTime(Date.now()),1000);return()=>clearInterval(t)},[]);

  const cMap=WIRE_COLORS[cableType];
  const activeC=cMap[wireFn]||Object.values(cMap)[0];
  const cost=useMemo(()=>buildGrid(OBSTACLES,mode==="schematic"?0:clearance),[clearance,mode]);

  const handleClick=useCallback((e)=>{
    if(tab!=="route")return;
    const svg=svgRef.current;if(!svg)return;
    const r=svg.getBoundingClientRect();
    const x=e.clientX-r.left,y=e.clientY-r.top;
    if(!picking){setPicking({start:{x,y}});setStatusMsg("Click destination endpoint...")}
    else{
      const path=astar(picking.start,{x,y},cost);
      const ref=`${cableType}-${String(nextRef).padStart(3,"0")}`;
      const tag=tagPlacement(path);
      const len=pathLen(path);const bends=pathBends(path);
      const newRoute={id:Date.now(),start:picking.start,end:{x,y},path,mode,cableType,wireFn,color:activeC,ref,
        tagText:mode==="cable_tag"?`${ref} Z01`:"",tagPos:tag.pos,tagAngle:tag.angle,len,bends,bendDeg:bends*90};
      setRoutes(p=>[...p,newRoute]);
      setNextRef(p=>p+1);setPicking(null);
      setStatusMsg(`Routed ${ref}: ${len.toFixed(0)}px, ${bends} bends (${bends*90}°)`);
      if(bends*90>360)setStatusMsg(s=>s+" ⚠ EXCEEDS 360° — ADD PULL POINT");
    }
  },[tab,picking,cost,cableType,wireFn,activeC,nextRef,mode]);

  // NEC calc
  const necResult=useMemo(()=>{
    const area=CONDUIT_AREAS[necConduit]||3.356;
    let totalA=0,totalN=0;
    necWires.forEach(w=>{const g=GAUGES[w.gauge];if(g){totalA+=g.a*w.count;totalN+=w.count}});
    const fillPct=(totalA/area)*100;
    const fillLimit=totalN<=1?53:totalN<=2?31:40;
    const derate=getDerate(totalN);
    const tempCorr=getTempCorr(necTemp);
    const combined=derate*tempCorr;
    return{fillPct,fillLimit,totalA,area,totalN,derate,tempCorr,combined};
  },[necWires,necConduit,necTemp]);

  const stats=useMemo(()=>{
    const totalLen=routes.reduce((s,r)=>s+r.len,0);
    const totalBends=routes.reduce((s,r)=>s+r.bends,0);
    const ac=routes.filter(r=>r.cableType==="AC").length;
    const dc=routes.filter(r=>r.cableType==="DC").length;
    return{totalLen,totalBends,ac,dc,total:routes.length};
  },[routes]);

  const now=new Date(time);
  const timeStr=now.toLocaleTimeString("en-US",{hour12:false});
  const dateStr=now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  return(
    <div style={{
      fontFamily:"'IBM Plex Mono','Fira Code',monospace",
      background:"#04070d",color:"#8aa4c0",
      height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",
      fontSize:11,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
        @keyframes scan{0%{top:-2px}100%{top:100%}}
        @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes glow{0%,100%{box-shadow:0 0 4px #f59e0b30}50%{box-shadow:0 0 12px #f59e0b50}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#0a0f18}
        ::-webkit-scrollbar-thumb{background:#1a2744;border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#2a3a5a}
      `}</style>

      {/* ═══════ HEADER ═══════ */}
      <header style={{
        background:"linear-gradient(180deg,#0b1220 0%,#080e18 100%)",
        borderBottom:"1px solid #1a2744",
        padding:"0 16px",height:42,minHeight:42,
        display:"flex",alignItems:"center",gap:12,
        position:"relative",overflow:"hidden",
      }}>
        {/* Scanline effect */}
        <div style={{position:"absolute",left:0,right:0,top:0,height:1,background:"linear-gradient(90deg,transparent,#f59e0b20,transparent)",animation:"scan 4s linear infinite",pointerEvents:"none"}}/>

        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect x="1" y="1" width="24" height="24" rx="5" stroke="#f59e0b" strokeWidth="1.2" opacity=".5"/>
            <path d="M6 13L10 13L12 6L14 20L16 13L20 13" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="6" cy="13" r="1.5" fill="#f59e0b"/>
            <circle cx="20" cy="13" r="1.5" fill="#f59e0b"/>
          </svg>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#f59e0b",letterSpacing:2,lineHeight:1}}>
              CONDUIT<span style={{color:"#22c55e"}}>ROUTE</span>
              <span style={{fontSize:8,color:"#3a5a7a",marginLeft:6,fontWeight:400,letterSpacing:.5}}>v2.1.0</span>
            </div>
            <div style={{fontSize:7,color:"#2a4a6a",letterSpacing:1,marginTop:1}}>CABLE ROUTING & CONDUIT AUTO-ROUTER</div>
          </div>
        </div>

        {/* Status indicators */}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12,fontSize:9}}>
          <Indicator label="ACAD" status="connected" />
          <Indicator label="ENGINE" status="active" />
          <div style={{color:"#2a4a6a",borderLeft:"1px solid #1a2744",paddingLeft:10}}>
            <span style={{color:"#4a6a8a"}}>{dateStr}</span>
            <span style={{color:"#f59e0b",marginLeft:8,fontWeight:600}}>{timeStr}</span>
          </div>
        </div>
      </header>

      {/* ═══════ TAB BAR ═══════ */}
      <div style={{
        display:"flex",background:"#060b14",borderBottom:"1px solid #12192a",
        padding:"0 8px",gap:1,
      }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"8px 18px",background:tab===t.id?"#0c1424":"transparent",
            border:"none",borderBottom:tab===t.id?"2px solid #f59e0b":"2px solid transparent",
            borderTop:tab===t.id?"1px solid #1a274440":"1px solid transparent",
            color:tab===t.id?"#f59e0b":"#3a5a7a",cursor:"pointer",
            fontSize:10,fontWeight:tab===t.id?700:500,fontFamily:"inherit",
            letterSpacing:.8,transition:"all .15s",display:"flex",alignItems:"center",gap:6,
          }}>
            <span style={{fontSize:12}}>{t.icon}</span>{t.label}
          </button>
        ))}

        {/* Mode switcher (only on route tab) */}
        {tab==="route"&&(
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,padding:"0 8px"}}>
            {[
              {id:"plan_view",l:"Plan View",c:"#22c55e"},
              {id:"cable_tag",l:"Cable Tag",c:"#818cf8"},
              {id:"schematic",l:"Schematic",c:"#ef4444"},
            ].map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)} style={{
                padding:"3px 10px",fontSize:8,fontFamily:"inherit",fontWeight:600,
                background:mode===m.id?`${m.c}15`:"transparent",
                border:`1px solid ${mode===m.id?`${m.c}40`:"transparent"}`,
                color:mode===m.id?m.c:"#3a5a7a",borderRadius:3,cursor:"pointer",letterSpacing:.5,
              }}>{m.l}</button>
            ))}
          </div>
        )}
      </div>

      {/* ═══════ MAIN BODY ═══════ */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ═══════ LEFT SIDEBAR ═══════ */}
        <div style={{
          width:210,background:"#060b14",borderRight:"1px solid #12192a",
          display:"flex",flexDirection:"column",overflow:"hidden",
        }}>
          <div style={{flex:1,overflowY:"auto",padding:"10px 10px 6px"}}>
            {/* Wire config */}
            <Sec title="CABLE / WIRE">
              <div style={{display:"flex",gap:3,marginBottom:6}}>
                {["AC","DC"].map(t=>(
                  <button key={t} onClick={()=>{setCableType(t);setWireFn(Object.keys(WIRE_COLORS[t])[0])}} style={{
                    flex:1,padding:4,background:cableType===t?"#1a2d4d":"transparent",
                    border:`1px solid ${cableType===t?"#f59e0b50":"#12192a"}`,
                    color:cableType===t?"#f59e0b":"#3a5a7a",borderRadius:3,
                    cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11,
                  }}>{t}</button>
                ))}
              </div>
              {Object.entries(cMap).map(([fn,info])=>(
                <button key={fn} onClick={()=>setWireFn(fn)} style={{
                  display:"flex",alignItems:"center",gap:6,width:"100%",
                  padding:"3px 5px",background:wireFn===fn?"#1a2d4d":"transparent",
                  border:`1px solid ${wireFn===fn?"#ffffff08":"transparent"}`,
                  borderRadius:2,cursor:"pointer",fontFamily:"inherit",fontSize:9,
                  color:wireFn===fn?"#ccc":"#4a6a8a",
                }}>
                  <div style={{width:9,height:9,borderRadius:2,background:info.hex,border:"1px solid #00000060",flexShrink:0}}/>
                  <span style={{flex:1,textAlign:"left"}}>{fn}</span>
                  <span style={{color:"#2a4a6a",fontSize:7,fontWeight:600}}>{info.code}</span>
                </button>
              ))}
            </Sec>

            {/* Clearance */}
            {tab==="route"&&mode!=="schematic"&&(
              <Sec title={`CLEARANCE — ${clearance}px`}>
                <input type="range" min={4} max={48} value={clearance}
                  onChange={e=>setClearance(+e.target.value)} style={{width:"100%",accentColor:"#f59e0b"}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:7,color:"#2a4a6a"}}>
                  <span>MIN</span><span style={{color:clearance>30?"#ef4444":"#22c55e"}}>{(clearance/6).toFixed(1)}ft</span><span>MAX</span>
                </div>
              </Sec>
            )}

            {/* Display options */}
            {tab==="route"&&(
              <Sec title="DISPLAY">
                <Toggle label="Clearance zones" checked={showClearance} onChange={setShowClearance}/>
                <Toggle label="Routing grid" checked={showGrid} onChange={setShowGrid}/>
                <Toggle label="Thermal overlay" checked={showHeat} onChange={setShowHeat}/>
              </Sec>
            )}

            {/* Legend */}
            {tab==="route"&&(
              <Sec title="LEGEND">
                {[
                  {c:"#8b5e3c",l:"Foundation"},
                  {c:"#3a5a8a",l:"Building"},
                  {c:"#3a6a3a",l:"Equipment Pad"},
                  {c:"#1a4a7a",l:"Trench (preferred)"},
                  {c:"#5a5040",l:"Road"},
                  {c:"#3a3a3a",l:"Fence"},
                ].map(item=>(
                  <div key={item.l} style={{display:"flex",alignItems:"center",gap:6,fontSize:8,color:"#4a6a8a"}}>
                    <div style={{width:10,height:6,background:item.c,borderRadius:1,flexShrink:0}}/>
                    {item.l}
                  </div>
                ))}
              </Sec>
            )}
          </div>

          {/* Sidebar footer stats */}
          <div style={{
            borderTop:"1px solid #12192a",padding:8,
            background:"linear-gradient(180deg,#080e18,#060b14)",
          }}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:8}}>
              <MiniStat label="ROUTES" value={stats.total} color="#f59e0b"/>
              <MiniStat label="BENDS" value={stats.totalBends} color={stats.totalBends*90>360?"#ef4444":"#22c55e"}/>
              <MiniStat label="AC" value={stats.ac} color="#3b82f6"/>
              <MiniStat label="DC" value={stats.dc} color="#dc2626"/>
            </div>
          </div>
        </div>

        {/* ═══════ CENTER CONTENT ═══════ */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* ── ROUTE TAB ── */}
          {tab==="route"&&(
            <>
              <div style={{flex:1,overflow:"auto",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:10,background:"#040710"}}>
                <div style={{position:"relative"}}>
                  <svg ref={svgRef} width={W} height={H}
                    onClick={handleClick}
                    onMouseMove={e=>{const r=svgRef.current?.getBoundingClientRect();if(r)setHover({x:e.clientX-r.left,y:e.clientY-r.top})}}
                    onMouseLeave={()=>setHover(null)}
                    style={{display:"block",background:"#040710",border:"1px solid #12192a",borderRadius:4,cursor:picking?"crosshair":"pointer"}}
                  >
                    <defs>
                      <pattern id="gg" width="30" height="30" patternUnits="userSpaceOnUse">
                        <path d="M30 0L0 0 0 30" fill="none" stroke="#0a1018" strokeWidth=".4"/>
                      </pattern>
                      <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    </defs>
                    <rect width={W} height={H} fill="url(#gg)"/>

                    {/* Grid debug */}
                    {showGrid&&cost.grid.map((row,gy)=>row.map((v,gx)=>{
                      if(Math.abs(v)<.01)return null;
                      return<rect key={`${gx}-${gy}`} x={gx*GRID_RES} y={gy*GRID_RES} width={GRID_RES} height={GRID_RES}
                        fill={v>=999?"#ff000018":v<0?"#0066ff15":`rgba(255,160,0,${Math.min(v*.08,.2)})`}/>;
                    }))}

                    {/* Heat map */}
                    {showHeat&&routes.length>0&&routes.map((r,ri)=>r.path.map((p,pi)=>{
                      if(pi===0)return null;
                      return<circle key={`h-${ri}-${pi}`} cx={p.x} cy={p.y} r={12+ri*2}
                        fill={`hsl(${40-ri*30},80%,50%)`} opacity={.04}/>;
                    }))}

                    {/* Clearance halos */}
                    {showClearance&&mode!=="schematic"&&OBSTACLES.filter(o=>o.type!=="fence"&&o.type!=="trench").map(obs=>{
                      const z=inflateObs(obs,clearance);
                      return<rect key={`c-${obs.id}`} x={z.x} y={z.y} width={z.w} height={z.h}
                        fill="#ff440005" stroke="#ff440012" strokeWidth={.5} strokeDasharray="3,3" rx={3}/>;
                    })}

                    {/* Obstacles */}
                    {OBSTACLES.map(obs=>{
                      const s=OBS_STYLES[obs.type]||OBS_STYLES.foundation;
                      const isFence=obs.type==="fence",isTrench=obs.type==="trench";
                      return(
                        <g key={obs.id}>
                          <rect x={obs.x} y={obs.y} width={obs.w} height={obs.h}
                            fill={isFence?"none":s.f} stroke={s.s}
                            strokeWidth={isFence?1:isTrench?.8:1.2}
                            strokeDasharray={isFence?"6,3":isTrench?"5,3":"none"}
                            rx={isTrench?1:2}/>
                          {obs.label&&obs.label.split("\n").map((ln,li)=>(
                            <text key={li} x={obs.x+obs.w/2} y={obs.y+obs.h/2+li*10-(obs.label.split("\n").length-1)*4.5}
                              fill={s.l} fontSize={isTrench?6:7} fontFamily="monospace"
                              textAnchor="middle" dominantBaseline="middle" fontWeight={600} opacity={.8}>{ln}</text>
                          ))}
                        </g>
                      );
                    })}

                    {/* Equipment */}
                    {EQUIP.map(eq=>(
                      <g key={eq.id}>
                        <circle cx={eq.x} cy={eq.y} r={5} fill={eq.color} opacity={.2}/>
                        <circle cx={eq.x} cy={eq.y} r={2.5} fill={eq.color}/>
                        <text x={eq.x} y={eq.y-9} fill={eq.color} fontSize={7} fontFamily="monospace" textAnchor="middle" fontWeight={700} opacity={.9}>{eq.label}</text>
                      </g>
                    ))}

                    {/* Routes */}
                    {routes.map((rt,ri)=>{
                      const isTag=rt.mode==="cable_tag";
                      const isSel=selectedRoute===rt.id;
                      return(
                        <g key={rt.id} onClick={e=>{e.stopPropagation();setSelectedRoute(isSel?null:rt.id)}} style={{cursor:"pointer"}}>
                          <path d={pathSvg(rt.path)} fill="none" stroke="#000" strokeWidth={isTag?2.5:4.5} strokeLinecap="round" opacity={.2}/>
                          <path d={pathSvg(rt.path)} fill="none" stroke={rt.color.stroke}
                            strokeWidth={isTag?1.5:isSel?3.5:2.5} strokeLinecap="round"
                            strokeDasharray={isTag?"8,4,2,4":"none"} opacity={isSel?1:.75}
                            filter={isSel?"url(#glow)":"none"}/>
                          <circle cx={rt.start.x} cy={rt.start.y} r={3.5} fill={rt.color.hex} stroke="#040710" strokeWidth={1.5}/>
                          <circle cx={rt.end.x} cy={rt.end.y} r={3.5} fill={rt.color.hex} stroke="#040710" strokeWidth={1.5}/>
                          {isTag&&rt.tagPos&&(
                            <g transform={`translate(${rt.tagPos.x},${rt.tagPos.y}) rotate(${rt.tagAngle})`}>
                              <rect x={-36} y={-9} width={72} height={13} rx={2} fill="#040710ee" stroke={rt.color.stroke} strokeWidth={.4}/>
                              <text x={0} y={1.5} fill={rt.color.stroke} fontSize={7.5} fontFamily="monospace" fontWeight={700} textAnchor="middle" dominantBaseline="middle">{rt.tagText}</text>
                            </g>
                          )}
                          {!isTag&&rt.path.length>2&&(()=>{
                            const m=rt.path[Math.floor(rt.path.length/2)];
                            return<g>
                              <rect x={m.x-18} y={m.y-13} width={36} height={11} rx={2} fill="#040710ee" stroke={rt.color.stroke} strokeWidth={.4}/>
                              <text x={m.x} y={m.y-5.5} fill={rt.color.stroke} fontSize={6.5} fontFamily="monospace" fontWeight={700} textAnchor="middle">{rt.ref}</text>
                            </g>;
                          })()}
                        </g>
                      );
                    })}

                    {/* Pick indicator */}
                    {picking&&(
                      <g>
                        <circle cx={picking.start.x} cy={picking.start.y} r={7} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="3,2">
                          <animate attributeName="r" values="5;10;5" dur="1s" repeatCount="indefinite"/>
                          <animate attributeName="opacity" values="1;.3;1" dur="1s" repeatCount="indefinite"/>
                        </circle>
                        {hover&&<line x1={picking.start.x} y1={picking.start.y} x2={hover.x} y2={hover.y} stroke="#22c55e" strokeWidth={.8} strokeDasharray="4,4" opacity={.3}/>}
                      </g>
                    )}

                    {/* Hover crosshair */}
                    {hover&&!picking&&(
                      <g opacity={.25}>
                        <line x1={hover.x-10} y1={hover.y} x2={hover.x+10} y2={hover.y} stroke="#f59e0b" strokeWidth={.4}/>
                        <line x1={hover.x} y1={hover.y-10} x2={hover.x} y2={hover.y+10} stroke="#f59e0b" strokeWidth={.4}/>
                      </g>
                    )}
                  </svg>

                  {/* Overlay: coordinates */}
                  {hover&&(
                    <div style={{position:"absolute",top:6,right:6,background:"#040710e0",border:"1px solid #12192a",borderRadius:3,padding:"3px 7px",fontSize:8,color:"#4a6a8a",fontFamily:"monospace",pointerEvents:"none"}}>
                      {hover.x.toFixed(0)}, {hover.y.toFixed(0)}
                    </div>
                  )}
                </div>
              </div>

              {/* Route list bottom panel */}
              {routes.length>0&&(
                <div style={{maxHeight:130,overflowY:"auto",background:"#060b14",borderTop:"1px solid #12192a"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:9}}>
                    <thead><tr style={{borderBottom:"1px solid #12192a"}}>
                      {["Ref","Mode","Type","Fn","Color","Length","Bends","°Total","Tag"].map(h=>
                        <th key={h} style={{padding:"5px 6px",textAlign:"left",color:"#2a4a6a",fontWeight:600,fontSize:8,letterSpacing:.5}}>{h}</th>
                      )}
                    </tr></thead>
                    <tbody>{routes.map(r=>(
                      <tr key={r.id} onClick={()=>setSelectedRoute(selectedRoute===r.id?null:r.id)}
                        style={{borderBottom:"1px solid #080e18",background:selectedRoute===r.id?"#0c1424":"transparent",cursor:"pointer"}}>
                        <td style={{padding:"4px 6px",color:"#f59e0b",fontWeight:700}}>{r.ref}</td>
                        <td style={{padding:"4px 6px"}}><ModeBadge mode={r.mode}/></td>
                        <td style={{padding:"4px 6px"}}>{r.cableType}</td>
                        <td style={{padding:"4px 6px"}}>{r.wireFn}</td>
                        <td style={{padding:"4px 6px"}}><span style={{display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:7,height:7,borderRadius:1,background:r.color.hex,display:"inline-block"}}/>{r.color.code}</span></td>
                        <td style={{padding:"4px 6px"}}>{r.len.toFixed(0)}</td>
                        <td style={{padding:"4px 6px"}}>{r.bends}</td>
                        <td style={{padding:"4px 6px",color:r.bendDeg>360?"#ef4444":"#4a6a8a"}}>{r.bendDeg}°{r.bendDeg>360?" ⚠":""}</td>
                        <td style={{padding:"4px 6px",color:"#818cf8"}}>{r.tagText||"—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── SCHEDULE TAB ── */}
          {tab==="schedule"&&(
            <div style={{flex:1,overflow:"auto",padding:16}}>
              <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
                <h3 style={{color:"#f59e0b",fontSize:13,fontWeight:700,letterSpacing:1.5,margin:0}}>CABLE / WIRE SCHEDULE</h3>
                <span style={{fontSize:9,color:"#2a4a6a"}}>{routes.length} cables routed</span>
              </div>
              {routes.length===0?(
                <div style={{color:"#2a4a6a",textAlign:"center",padding:40,fontSize:11}}>Route cables in the Route tab to populate this schedule.</div>
              ):(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:9}}>
                    <thead><tr style={{borderBottom:"2px solid #1a2744"}}>
                      {["Cable Ref","Type","Function","Color Code","From (X,Y)","To (X,Y)","Est. Length","Bends","Bend Total","Mode","Tag Text"].map(h=>
                        <th key={h} style={{padding:"8px 8px",textAlign:"left",color:"#4a6a8a",fontWeight:600,letterSpacing:.5,whiteSpace:"nowrap"}}>{h}</th>
                      )}
                    </tr></thead>
                    <tbody>{routes.map(r=>(
                      <tr key={r.id} style={{borderBottom:"1px solid #0c1220"}}>
                        <td style={{padding:"6px 8px",color:"#f59e0b",fontWeight:700}}>{r.ref}</td>
                        <td style={{padding:"6px 8px"}}>{r.cableType}</td>
                        <td style={{padding:"6px 8px"}}>{r.wireFn}</td>
                        <td style={{padding:"6px 8px"}}><span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:2,background:r.color.hex}}/>{r.color.code} — {Object.entries(WIRE_COLORS[r.cableType]).find(([k])=>k===r.wireFn)?.[1]?.code}</span></td>
                        <td style={{padding:"6px 8px",color:"#22c55e"}}>({r.start.x.toFixed(0)},{r.start.y.toFixed(0)})</td>
                        <td style={{padding:"6px 8px",color:"#ef4444"}}>({r.end.x.toFixed(0)},{r.end.y.toFixed(0)})</td>
                        <td style={{padding:"6px 8px"}}>{r.len.toFixed(1)} px</td>
                        <td style={{padding:"6px 8px"}}>{r.bends}</td>
                        <td style={{padding:"6px 8px",color:r.bendDeg>360?"#ef4444":"#8aa4c0"}}>{r.bendDeg}°{r.bendDeg>360?" ⚠ PULL PT":""}</td>
                        <td style={{padding:"6px 8px"}}><ModeBadge mode={r.mode}/></td>
                        <td style={{padding:"6px 8px",color:"#818cf8"}}>{r.tagText||"—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── NEC CALC TAB ── */}
          {tab==="nec"&&(
            <div style={{flex:1,overflow:"auto",padding:16,display:"flex",gap:16,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:280}}>
                <h3 style={{color:"#f59e0b",fontSize:13,fontWeight:700,letterSpacing:1.5,margin:"0 0 14px"}}>NEC CONDUIT FILL & DERATING</h3>
                <Sec title="CONDUIT">
                  <select value={necConduit} onChange={e=>setNecConduit(e.target.value)} style={selSt}>
                    {Object.keys(CONDUIT_AREAS).map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </Sec>
                <Sec title={`AMBIENT TEMP — ${necTemp}°C (${(necTemp*9/5+32).toFixed(0)}°F)`}>
                  <input type="range" min={20} max={60} value={necTemp} onChange={e=>setNecTemp(+e.target.value)} style={{width:"100%",accentColor:necTemp>40?"#ef4444":"#22c55e"}}/>
                </Sec>
                <Sec title="CONDUCTORS">
                  {necWires.map((w,i)=>(
                    <div key={i} style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
                      <select value={w.gauge} onChange={e=>{const n=[...necWires];n[i]={...n[i],gauge:e.target.value};setNecWires(n)}} style={{...selSt,flex:2}}>
                        {Object.keys(GAUGES).map(g=><option key={g} value={g}>{g}</option>)}
                      </select>
                      <input type="number" min={1} max={50} value={w.count}
                        onChange={e=>{const n=[...necWires];n[i]={...n[i],count:Math.max(1,+e.target.value)};setNecWires(n)}}
                        style={{...selSt,flex:1,width:40}}/>
                      <button onClick={()=>setNecWires(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,fontFamily:"inherit",padding:"0 4px"}}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>setNecWires(p=>[...p,{gauge:"12 AWG",count:1}])} style={{...selSt,cursor:"pointer",color:"#4a6a8a",background:"#080e18",marginTop:4}}>+ Add Conductor</button>
                </Sec>
              </div>
              <div style={{flex:1,minWidth:280}}>
                <h3 style={{color:"#22c55e",fontSize:13,fontWeight:700,letterSpacing:1.5,margin:"0 0 14px"}}>RESULTS</h3>
                <NecCard label="Conduit Fill" value={`${necResult.fillPct.toFixed(1)}%`}
                  status={necResult.fillPct>necResult.fillLimit?"fail":necResult.fillPct>necResult.fillLimit*.8?"warn":"pass"}
                  note={`NEC Ch.9 Table 1 limit: ${necResult.fillLimit}% for ${necResult.totalN} conductor${necResult.totalN>1?"s":""}`}/>
                <NecCard label="Ampacity Derating" value={`${(necResult.derate*100).toFixed(0)}%`}
                  status={necResult.derate<.5?"warn":"pass"}
                  note={`NEC 310.15(C)(1) — ${necResult.totalN} CCC`}/>
                <NecCard label="Temp Correction" value={`${(necResult.tempCorr*100).toFixed(0)}%`}
                  status={necResult.tempCorr<.75?"fail":necResult.tempCorr<.88?"warn":"pass"}
                  note={`Ambient ${necTemp}°C / ${(necTemp*9/5+32).toFixed(0)}°F — base 30°C`}/>
                <NecCard label="Combined Factor" value={`${(necResult.combined*100).toFixed(1)}%`}
                  status={necResult.combined<.4?"fail":necResult.combined<.6?"warn":"pass"}
                  note="Derating × Temp Correction applied to Table 310.16 ampacity"/>

                <div style={{marginTop:12,padding:10,background:"#080e18",borderRadius:4,border:"1px solid #12192a"}}>
                  <div style={{fontSize:8,color:"#3a5a7a",fontWeight:600,marginBottom:6,letterSpacing:1}}>THERMAL STATUS</div>
                  <div style={{height:10,borderRadius:5,overflow:"hidden",background:"linear-gradient(90deg,#22c55e 0%,#eab308 50%,#ef4444 100%)",position:"relative"}}>
                    <div style={{position:"absolute",left:`${Math.min(95,Math.max(5,(1-necResult.combined)*100))}%`,top:-1,width:3,height:12,background:"#fff",borderRadius:2,transform:"translateX(-50%)",boxShadow:"0 0 6px #fff8"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:7,color:"#2a4a6a",marginTop:3}}>
                    <span>Cool</span><span>Warm</span><span>Critical</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION CUTS TAB ── */}
          {tab==="section"&&(
            <div style={{flex:1,overflow:"auto",padding:16}}>
              <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:12}}>
                <h3 style={{color:"#f59e0b",fontSize:13,fontWeight:700,letterSpacing:1.5,margin:0}}>2D SECTION CUTS</h3>
              </div>
              <div style={{display:"flex",gap:4,marginBottom:14}}>
                {[{id:"stub_up",l:"Stub-Up"},{id:"duct_bank",l:"Duct Bank"},{id:"trench",l:"Cable Trench"},{id:"entry",l:"Bldg Entry"}].map(s=>(
                  <button key={s.id} onClick={()=>setSectionType(s.id)} style={{
                    padding:"5px 14px",background:sectionType===s.id?"#1a2d4d":"#080e18",
                    border:`1px solid ${sectionType===s.id?"#f59e0b40":"#12192a"}`,
                    color:sectionType===s.id?"#f59e0b":"#3a5a7a",borderRadius:3,
                    cursor:"pointer",fontSize:9,fontFamily:"inherit",fontWeight:600,
                  }}>{s.l}</button>
                ))}
              </div>
              <svg width="650" height="380" style={{background:"#040710",border:"1px solid #12192a",borderRadius:4}}>
                {sectionType==="stub_up"&&<StubUp/>}
                {sectionType==="duct_bank"&&<DuctBank/>}
                {sectionType==="trench"&&<Trench/>}
                {sectionType==="entry"&&<Entry/>}
              </svg>
            </div>
          )}
        </div>

        {/* ═══════ RIGHT SIDEBAR — ROUTE INSPECTOR ═══════ */}
        {tab==="route"&&selectedRoute&&(()=>{
          const r=routes.find(rt=>rt.id===selectedRoute);
          if(!r)return null;
          return(
            <div style={{width:190,background:"#060b14",borderLeft:"1px solid #12192a",padding:10,overflowY:"auto",fontSize:9}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{color:"#f59e0b",fontWeight:700,fontSize:12}}>{r.ref}</span>
                <button onClick={()=>setSelectedRoute(null)} style={{background:"none",border:"none",color:"#3a5a7a",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>×</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <InspRow label="Mode"><ModeBadge mode={r.mode}/></InspRow>
                <InspRow label="Cable Type">{r.cableType}</InspRow>
                <InspRow label="Wire Function">{r.wireFn}</InspRow>
                <InspRow label="Color Code">
                  <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                    <span style={{width:8,height:8,borderRadius:2,background:r.color.hex}}/>
                    {r.color.code}
                  </span>
                </InspRow>
                <InspRow label="ACI Color">{r.color.aci}</InspRow>
                <InspRow label="Start">({r.start.x.toFixed(0)},{r.start.y.toFixed(0)})</InspRow>
                <InspRow label="End">({r.end.x.toFixed(0)},{r.end.y.toFixed(0)})</InspRow>
                <InspRow label="Path Points">{r.path.length}</InspRow>
                <InspRow label="Length">{r.len.toFixed(1)} px</InspRow>
                <InspRow label="Bends">{r.bends}</InspRow>
                <InspRow label="Bend Total"><span style={{color:r.bendDeg>360?"#ef4444":"#22c55e"}}>{r.bendDeg}°</span></InspRow>
                {r.bendDeg>360&&<div style={{padding:6,background:"#1a0808",border:"1px solid #4a1a1a",borderRadius:3,color:"#ef4444",fontSize:8}}>⚠ Exceeds NEC 360° limit between pull points</div>}
                {r.tagText&&<InspRow label="Tag">{r.tagText}</InspRow>}
              </div>
              <button onClick={()=>{setRoutes(p=>p.filter(rt=>rt.id!==selectedRoute));setSelectedRoute(null)}}
                style={{marginTop:12,width:"100%",padding:6,background:"#1a0808",border:"1px solid #4a1a1a",color:"#ef4444",borderRadius:3,cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>
                Delete Route
              </button>
            </div>
          );
        })()}
      </div>

      {/* ═══════ STATUS BAR ═══════ */}
      <div style={{
        height:24,minHeight:24,background:"#04070d",borderTop:"1px solid #12192a",
        padding:"0 12px",display:"flex",alignItems:"center",gap:16,fontSize:8,color:"#2a4a6a",
      }}>
        <span style={{color:statusMsg.includes("⚠")?"#ef4444":"#4a6a8a"}}>{statusMsg}</span>
        <span style={{marginLeft:"auto"}}>Grid: {GRID_RES}px | Obstacles: {OBSTACLES.length} | Total length: {stats.totalLen.toFixed(0)}px</span>
        <button onClick={()=>{setRoutes([]);setPicking(null);setNextRef(1);setSelectedRoute(null);setStatusMsg("Cleared all routes")}}
          style={{background:"none",border:"none",color:"#4a1a1a",cursor:"pointer",fontSize:8,fontFamily:"inherit",padding:"0 4px"}}>CLEAR ALL</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function Sec({title,children}){
  return <div style={{marginBottom:10}}>
    <div style={{fontSize:8,color:"#2a4a6a",fontWeight:700,letterSpacing:1.2,marginBottom:5}}>{title}</div>
    <div style={{display:"flex",flexDirection:"column",gap:2}}>{children}</div>
  </div>;
}

function Toggle({label,checked,onChange}){
  return<label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:8,color:"#4a6a8a"}}>
    <div onClick={()=>onChange(!checked)} style={{width:24,height:12,borderRadius:6,background:checked?"#22c55e30":"#12192a",border:`1px solid ${checked?"#22c55e50":"#1a2744"}`,position:"relative",cursor:"pointer",transition:"all .2s"}}>
      <div style={{width:8,height:8,borderRadius:4,background:checked?"#22c55e":"#3a5a7a",position:"absolute",top:1,left:checked?13:1,transition:"all .2s"}}/>
    </div>
    {label}
  </label>;
}

function Indicator({label,status}){
  const colors={connected:"#22c55e",active:"#22c55e",warning:"#eab308",error:"#ef4444"};
  const c=colors[status]||"#3a5a7a";
  return<div style={{display:"flex",alignItems:"center",gap:4,fontSize:8}}>
    <div style={{width:5,height:5,borderRadius:"50%",background:c,boxShadow:`0 0 4px ${c}80`,animation:"pulse 2s infinite"}}/>
    <span style={{color:"#3a5a7a"}}>{label}</span>
  </div>;
}

function MiniStat({label,value,color}){
  return<div style={{background:"#080e18",borderRadius:3,padding:"4px 6px",border:"1px solid #12192a"}}>
    <div style={{fontSize:7,color:"#2a4a6a",letterSpacing:.8}}>{label}</div>
    <div style={{fontSize:13,fontWeight:700,color,lineHeight:1.2}}>{value}</div>
  </div>;
}

function ModeBadge({mode}){
  const m={plan_view:{l:"PLAN",c:"#22c55e"},cable_tag:{l:"TAG",c:"#818cf8"},schematic:{l:"SCHEM",c:"#ef4444"}};
  const d=m[mode]||m.plan_view;
  return<span style={{padding:"1px 6px",borderRadius:2,fontSize:7,fontWeight:700,background:`${d.c}15`,color:d.c,letterSpacing:.5}}>{d.l}</span>;
}

function InspRow({label,children}){
  return<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 0",borderBottom:"1px solid #0a1018"}}>
    <span style={{color:"#3a5a7a",fontSize:8}}>{label}</span>
    <span style={{color:"#8aa4c0",fontWeight:500}}>{children}</span>
  </div>;
}

function NecCard({label,value,status,note}){
  const c={pass:"#22c55e",warn:"#eab308",fail:"#ef4444"};
  return<div style={{padding:10,background:"#080e18",borderRadius:4,border:`1px solid ${c[status]}20`,marginBottom:6}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
      <span style={{fontSize:9,color:"#4a6a8a"}}>{label}</span>
      <span style={{fontSize:16,fontWeight:700,color:c[status]}}>{value}</span>
    </div>
    <div style={{fontSize:8,color:"#2a4a6a",marginTop:3}}>{note}</div>
  </div>;
}

const selSt={padding:"4px 7px",background:"#080e18",border:"1px solid #12192a",color:"#8aa4c0",borderRadius:3,fontSize:9,fontFamily:"inherit"};

// ═══════════════════════════════════════════════════════════════════════
// SECTION CUT DRAWINGS
// ═══════════════════════════════════════════════════════════════════════

function Dim({x1,y1,x2,y2,label,v}){
  if(v)return<g><line x1={x1} y1={y1} x2={x1} y2={y2} stroke="#3a5a7a" strokeWidth={.4} strokeDasharray="2,2"/><line x1={x1-3} y1={y1} x2={x1+3} y2={y1} stroke="#3a5a7a" strokeWidth={.8}/><line x1={x1-3} y1={y2} x2={x1+3} y2={y2} stroke="#3a5a7a" strokeWidth={.8}/><text x={x1-6} y={(y1+y2)/2} fill="#3a5a7a" fontSize={7} fontFamily="monospace" textAnchor="end" dominantBaseline="middle">{label}</text></g>;
  return<g><line x1={x1} y1={y1} x2={x2} y2={y1} stroke="#3a5a7a" strokeWidth={.4} strokeDasharray="2,2"/><line x1={x1} y1={y1-3} x2={x1} y2={y1+3} stroke="#3a5a7a" strokeWidth={.8}/><line x1={x2} y1={y1-3} x2={x2} y2={y1+3} stroke="#3a5a7a" strokeWidth={.8}/><text x={(x1+x2)/2} y={y1-5} fill="#3a5a7a" fontSize={7} fontFamily="monospace" textAnchor="middle">{label}</text></g>;
}

function StubUp(){
  return<g>
    <rect x={0} y={190} width={650} height={190} fill="#1a1408" opacity={.4}/>
    <line x1={0} y1={190} x2={650} y2={190} stroke="#3a2a10" strokeWidth={1.5}/>
    <text x={16} y={206} fill="#3a5a7a" fontSize={8} fontFamily="monospace">GRADE</text>
    <rect x={220} y={150} width={210} height={50} fill="#2a2a2a" stroke="#444" rx={2}/>
    <text x={325} y={180} fill="#666" fontSize={7} fontFamily="monospace" textAnchor="middle">CONCRETE PAD</text>
    {[0,1,2,3].map(i=><g key={i}>
      <rect x={250+i*48} y={88} width={18} height={112} fill="none" stroke="#4a6a8a" strokeWidth={1.8} rx={1}/>
      <rect x={250+i*48} y={200} width={18} height={70} fill="none" stroke="#4a6a8a" strokeWidth={1.2} strokeDasharray="3,2"/>
      <text x={259+i*48} y={82} fill="#f59e0b" fontSize={7} fontFamily="monospace" textAnchor="middle">{i<3?2:3}"C</text>
      <circle cx={259+i*48} cy={140} r={3.5} fill={["#dc2626","#333","#2563eb","#16a34a"][i]}/>
    </g>)}
    <rect x={235} y={40} width={180} height={48} fill="#080e18" stroke="#f59e0b" strokeWidth={1.2} rx={4}/>
    <text x={325} y={62} fill="#f59e0b" fontSize={9} fontFamily="monospace" textAnchor="middle" fontWeight={700}>EQUIPMENT</text>
    <text x={325} y={76} fill="#3a5a7a" fontSize={7} fontFamily="monospace" textAnchor="middle">JUNCTION BOX / RELAY</text>
    <Dim x1={240} y1={72} x2={432} y2={72} label={`8'-0"`}/>
    <Dim x1={210} y1={88} x2={210} y2={200} label={`4'-0"`} v/>
    <text x={325} y={360} fill="#3a5a7a" fontSize={10} fontFamily="monospace" textAnchor="middle" fontWeight={700}>CONDUIT STUB-UP — SECTION VIEW</text>
  </g>;
}

function DuctBank(){
  const cd=[];for(let r=0;r<3;r++)for(let c=0;c<4;c++)cd.push({x:210+c*52,y:160+r*52});
  return<g>
    <rect x={0} y={120} width={650} height={260} fill="#1a1408" opacity={.35}/>
    <line x1={0} y1={120} x2={650} y2={120} stroke="#3a2a10" strokeWidth={1.5}/>
    <text x={16} y={115} fill="#3a5a7a" fontSize={8} fontFamily="monospace">GRADE</text>
    <rect x={185} y={135} width={240} height={180} fill="#2a2a2a" stroke="#444" strokeWidth={1.5} rx={3}/>
    <text x={305} y={150} fill="#555" fontSize={7} fontFamily="monospace" textAnchor="middle">CONCRETE ENCASED DUCT BANK</text>
    {cd.map((c,i)=><g key={i}>
      <circle cx={c.x} cy={c.y} r={17} fill="#181818" stroke="#4a6a8a" strokeWidth={1.5}/>
      <circle cx={c.x} cy={c.y} r={11} fill="#0a0e14"/>
      <circle cx={c.x-3} cy={c.y-2} r={2.5} fill="#dc2626" opacity={.8}/>
      <circle cx={c.x+3} cy={c.y-2} r={2.5} fill="#333" opacity={.8}/>
      <circle cx={c.x} cy={c.y+3} r={2.5} fill="#16a34a" opacity={.8}/>
    </g>)}
    <Dim x1={185} y1={335} x2={425} y2={335} label={`10'-0"`}/>
    <text x={325} y={365} fill="#3a5a7a" fontSize={10} fontFamily="monospace" textAnchor="middle" fontWeight={700}>DUCT BANK — CROSS SECTION</text>
  </g>;
}

function Trench(){
  return<g>
    <rect x={0} y={110} width={650} height={270} fill="#1a1408" opacity={.35}/>
    <line x1={0} y1={110} x2={650} y2={110} stroke="#3a2a10" strokeWidth={1.5}/>
    <rect x={190} y={110} width={8} height={170} fill="#444"/>
    <rect x={412} y={110} width={8} height={170} fill="#444"/>
    <rect x={190} y={275} width={230} height={8} fill="#444"/>
    <rect x={198} y={110} width={214} height={165} fill="#060b14" opacity={.7}/>
    {[0,1,2].map(i=><g key={i}>
      <rect x={208} y={148+i*48} width={194} height={5} fill="none" stroke="#4a6a8a" strokeWidth={1.2}/>
      {Array.from({length:5+i*2}).map((_,j)=>
        <circle key={j} cx={220+j*20} cy={143+i*48} r={4.5}
          fill={["#dc2626","#333","#2563eb","#e5e5e5","#16a34a","#dc2626","#333","#2563eb","#e5e5e5"][j%9]}
          stroke="#222" strokeWidth={.4}/>
      )}
      <text x={425} y={150+i*48} fill="#3a5a7a" fontSize={7} fontFamily="monospace">TRAY {i+1}</text>
    </g>)}
    <rect x={180} y={105} width={250} height={7} fill="#555" stroke="#777" rx={1}/>
    <text x={305} y={100} fill="#4a6a8a" fontSize={7} fontFamily="monospace" textAnchor="middle">COVER PLATE</text>
    <rect x={460} y={130} width={110} height={70} fill="#080e18" stroke="#12192a" rx={3}/>
    <text x={515} y={146} fill="#f59e0b" fontSize={8} fontFamily="monospace" textAnchor="middle" fontWeight={600}>TRAY FILL</text>
    <rect x={475} y={154} width={80} height={8} fill="#12192a" rx={3}/>
    <rect x={475} y={154} width={48} height={8} fill="#22c55e" rx={3}/>
    <text x={515} y={176} fill="#3a5a7a" fontSize={7} fontFamily="monospace" textAnchor="middle">60% — OK</text>
    <text x={515} y={190} fill="#2a4a6a" fontSize={6} fontFamily="monospace" textAnchor="middle">NEC Art. 392</text>
    <Dim x1={190} y1={306} x2={420} y2={306} label={`2'-0"`}/>
    <text x={305} y={360} fill="#3a5a7a" fontSize={10} fontFamily="monospace" textAnchor="middle" fontWeight={700}>CABLE TRENCH — CROSS SECTION</text>
  </g>;
}

function Entry(){
  return<g>
    <rect x={260} y={20} width={28} height={340} fill="#3a3a3a" stroke="#555"/>
    <text x={274} y={16} fill="#4a6a8a" fontSize={8} fontFamily="monospace" textAnchor="middle">WALL</text>
    <rect x={0} y={240} width={260} height={140} fill="#1a1408" opacity={.35}/>
    <rect x={288} y={240} width={362} height={140} fill="#1a1408" opacity={.35}/>
    <line x1={0} y1={240} x2={260} y2={240} stroke="#3a2a10" strokeWidth={1.5}/>
    <line x1={288} y1={240} x2={650} y2={240} stroke="#3a2a10" strokeWidth={1.5}/>
    {[0,1,2].map(i=>{
      const y=90+i*55;
      return<g key={i}>
        <rect x={90} y={y} width={170} height={16} fill="none" stroke="#4a6a8a" strokeWidth={1.5} rx={1}/>
        <rect x={250} y={y-4} width={18} height={24} fill="#2a2a2a" stroke="#f59e0b" strokeWidth={1.2} rx={3}/>
        <rect x={288} y={y} width={110} height={16} fill="none" stroke="#4a6a8a" strokeWidth={1.5} rx={1}/>
        <line x1={100} y1={y+8} x2={390} y2={y+8} stroke={["#dc2626","#333","#2563eb"][i]} strokeWidth={2.5} opacity={.5}/>
        <text x={60} y={y+10} fill="#3a5a7a" fontSize={7} fontFamily="monospace" textAnchor="middle">{["A","B","C"][i]}</text>
        <text x={420} y={y+10} fill="#f59e0b" fontSize={7} fontFamily="monospace">{`${i+1}"C-${["PH A","PH B","PH C"][i]}`}</text>
      </g>;
    })}
    <rect x={260} y={82} width={28} height={100} fill="#2563eb" opacity={.08}/>
    <text x={274} y={76} fill="#2563eb" fontSize={6} fontFamily="monospace" textAnchor="middle">SEAL</text>
    <rect x={420} y={55} width={110} height={130} fill="#080e18" stroke="#f59e0b" strokeWidth={1.2} rx={4}/>
    <text x={475} y={80} fill="#f59e0b" fontSize={9} fontFamily="monospace" textAnchor="middle" fontWeight={700}>PANEL</text>
    <text x={475} y={95} fill="#3a5a7a" fontSize={7} fontFamily="monospace" textAnchor="middle">P&C RELAY</text>
    <text x={325} y={360} fill="#3a5a7a" fontSize={10} fontFamily="monospace" textAnchor="middle" fontWeight={700}>BUILDING ENTRY — SECTION VIEW</text>
  </g>;
}
