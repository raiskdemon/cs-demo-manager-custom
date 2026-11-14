function escFfPath(p){return p.replaceAll("\\","/").replaceAll(":","\\:").replaceAll("'","\\'")}
function writeCleanTxtSync(p,txt){let clean=String(txt??"").replace(/[\r\n]/g," ").trim().replaceAll("%","\\%");pT.default.writeFileSync(p,clean,{encoding:"utf8"})}
function getWinFonts(){
  let windir=process.env.WINDIR||"C:\\Windows",fdir=R_.default.join(windir,"Fonts");
  let bolds=["segoeuib.ttf","arialbd.ttf","tahomabd.ttf","segoeui.ttf","arial.ttf"],monos=["consolab.ttf","consola.ttf","courbd.ttf","lucon.ttf","segoeuib.ttf"];
  let bold=R_.default.join(fdir,"segoeuib.ttf");
  for(let c of bolds){let full=R_.default.join(fdir,c);if(pT.default.existsSync(full)){bold=full;break}}
  let mono=bold;
  for(let c of monos){let full=R_.default.join(fdir,c);if(pT.default.existsSync(full)){mono=full;break}}
  let emoji=R_.default.join(fdir,"seguiemj.ttf");
  if(!pT.default.existsSync(emoji))emoji=bold;
  return{boldEsc:escFfPath(bold),monoEsc:escFfPath(mono),emojiEsc:escFfPath(emoji)};
}
function getVidCodecArgs(c,A,d,is120Fps=!1){
  let args=[`-c:v ${c}`];
  if(d!==""){args.push(d);return args}
  let cl=c.toLowerCase();
  if(cl.includes("nvenc")){
    args.push("-preset p4","-tune hq","-rc vbr",`-cq ${A}`,is120Fps?"-b:v 20000k":"-b:v 0");
    if(is120Fps)args.push("-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else if(cl.includes("amf")){
    args.push("-quality quality","-rc cqp",`-qp_i ${A}`,`-qp_p ${A}`);
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else if(cl.includes("qsv")){
    args.push("-preset medium",`-global_quality ${A}`);
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else if(cl.includes("mf")){
    let q=Math.max(1,Math.min(100,Math.round((51-A)*2)));
    args.push("-rate_control quality",`-quality ${q}`);
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else{
    args.push("-pix_fmt yuv420p");
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push(`-crf ${A}`);
  }
  return args;
}
function isExcludedWeaponForStreak(w){
  let name=String(w||"").toLowerCase();
  return name.includes("ssg")||name.includes("scout")||name.includes("negev")||name.includes("m249")||name.includes("xm1014")||name.includes("xm 1014")||name.includes("xm");
}
function isAutoWeaponForStreak(w){
  let name=String(w||"").toLowerCase();
  return ["ak-47","m4a4","m4a1-s","galil ar","famas","aug","sg 553","negev","m249","mp9","mac-10","mp7","mp5-sd","ump-45","p90","bizon"].some(x=>name.includes(x));
}
function buildSpeedSegments(rawSeqDur,speedIntervals){
  let points=new Set([0,rawSeqDur]);
  for(let it of speedIntervals){
    if(it.startSec>0&&it.startSec<rawSeqDur)points.add(it.startSec);
    if(it.endSec>0&&it.endSec<rawSeqDur)points.add(it.endSec);
  }
  let sorted=[...points].sort((a,b)=>a-b);
  let rawSegments=[];
  for(let i=0;i<sorted.length-1;i++){
    let s1=sorted[i],s2=sorted[i+1];
    if(s2-s1<0.05)continue;
    let mid=(s1+s2)/2;
    let speed=1.0;
    let slowMatch=speedIntervals.find(it=>it.speed===0.5&&mid>=it.startSec&&mid<=it.endSec);
    if(slowMatch){
      speed=0.5;
    }else{
      let ffMatch=speedIntervals.find(it=>it.speed===2.0&&mid>=it.startSec&&mid<=it.endSec);
      if(ffMatch)speed=2.0;
    }
    rawSegments.push({rawStart:s1,rawEnd:s2,speed});
  }
  let merged=[];
  for(let seg of rawSegments){
    if(merged.length>0&&merged[merged.length-1].speed===seg.speed){
      merged[merged.length-1].rawEnd=seg.rawEnd;
    }else{
      merged.push({...seg});
    }
  }
  let currentOut=0;
  for(let seg of merged){
    seg.outStart=currentOut;
    seg.outDur=(seg.rawEnd-seg.rawStart)/seg.speed;
    seg.outEnd=currentOut+seg.outDur;
    currentOut=seg.outEnd;
  }
  return{segments:merged,totalOutDuration:currentOut};
}
function splitIntervalsWithFastForward(rawIntervals,ffList,basePov){
  let result=[];
  for(let it of rawIntervals){
    let pieces=[it];
    for(let ff of ffList){
      let nextPieces=[];
      for(let p of pieces){
        let ovSt=Math.max(p.rawStart,ff.startSec),ovEn=Math.min(p.rawEnd,ff.endSec);
        if(ovEn>ovSt+0.1){
          if(ovSt>p.rawStart+0.1)nextPieces.push({rawStart:p.rawStart,rawEnd:ovSt,text:p.text,borderColor:p.borderColor,borderWidth:p.borderWidth});
          nextPieces.push({rawStart:ovSt,rawEnd:ovEn,text:`${basePov}  |  ⏩ AVANÇO RÁPIDO (2x)`,borderColor:"0x06b6d4cc",borderWidth:2});
          if(p.rawEnd>ovEn+0.1)nextPieces.push({rawStart:ovEn,rawEnd:p.rawEnd,text:p.text,borderColor:p.borderColor,borderWidth:p.borderWidth});
        }else{
          nextPieces.push(p);
        }
      }
      pieces=nextPieces;
    }
    result.push(...pieces);
  }
  return result;
}
function detectPrecisionKillStreaks(kills,shots){
  let result=new Map();
  if(!Array.isArray(shots)||shots.length===0||!Array.isArray(kills)||kills.length===0)return result;
  let gunShots=shots.filter(s=>{
    let w=String(s.weapon_name??s.weaponName??"").toLowerCase();
    if(isExcludedWeaponForStreak(w))return false;
    return !["knife","bayonet","karambit","dagger","flashbang","smoke","hegrenade","molotov","incendiary","decoy"].some(x=>w.includes(x));
  });
  let shotsByPlayerRound=new Map();
  for(let s of gunShots){
    let rnd=s.round_number??s.roundNumber;
    let sid=s.player_steam_id??s.playerSteamId;
    if(!rnd||!sid)continue;
    let key=`${rnd}:${sid}`;
    let l=shotsByPlayerRound.get(key);
    l?l.push(s):shotsByPlayerRound.set(key,[s]);
  }
  let streakSeq=0;
  for(let [key,pShots] of shotsByPlayerRound.entries()){
    let[rndStr,sid]=key.split(":");
    let rnd=Number(rndStr);
    let pKills=kills.filter(k=>{
      let isRnd=(k.round_number??k.roundNumber)===rnd;
      let isSid=(k.killer_steam_id??k.killerSteamId)===sid;
      let w=String(k.weapon_name??k.weaponName??"").toLowerCase();
      return isRnd&&isSid&&!isExcludedWeaponForStreak(w);
    });
    if(pKills.length<2)continue;
    pKills.sort((a,b)=>a.tick-b.tick);
    let currentStreak=[];
    for(let i=0;i<pKills.length;i++){
      let curKill=pKills[i];
      if(currentStreak.length===0){
        let shotsUpToKill=pShots.filter(s=>s.tick<=curKill.tick);
        let killShotIdx=shotsUpToKill.length-1;
        if(killShotIdx>=0){
          let shotTicks=[];
          for(let j=killShotIdx;j>=0;j--){
            let dt=j===killShotIdx?0:shotTicks[shotTicks.length-1]-shotsUpToKill[j].tick;
            if(j===killShotIdx||dt<=96){
              shotTicks.push(shotsUpToKill[j].tick);
            }else{
              break;
            }
          }
          let isSpray=shotTicks.length>=3||(shotTicks.length>=2&&(shotTicks[0]-shotTicks[1])<12&&isAutoWeaponForStreak(curKill.weapon_name??curKill.weaponName));
          if(!isSpray&&shotTicks.length<=2){
            currentStreak.push({kill:curKill});
          }
        }
      }else{
        let prevKill=currentStreak[currentStreak.length-1].kill;
        let tickGap=curKill.tick-prevKill.tick;
        let secGap=tickGap/64;
        if(secGap<=20){
          let shotsBetween=pShots.filter(s=>s.tick>prevKill.tick&&s.tick<=curKill.tick);
          let totalShotsBetween=shotsBetween.length;
          let hasSpray=false;
          for(let j=1;j<shotsBetween.length;j++){
            if(shotsBetween[j].tick-shotsBetween[j-1].tick<12&&isAutoWeaponForStreak(curKill.weapon_name??curKill.weaponName)){
              hasSpray=true;
              break;
            }
          }
          let killShotsCount=totalShotsBetween>0?1:0;
          for(let j=totalShotsBetween-2;j>=0;j--){
            let dt=shotsBetween[j+1].tick-shotsBetween[j].tick;
            if(dt<=96){
              killShotsCount++;
            }else{
              break;
            }
          }
          let extraShotsCount=totalShotsBetween-killShotsCount;
          if(!hasSpray&&totalShotsBetween>=1&&totalShotsBetween<=4&&killShotsCount<=2&&extraShotsCount<=2){
            currentStreak.push({kill:curKill});
            continue;
          }
        }
        if(currentStreak.length>=2){
          let len=currentStreak.length;++streakSeq;
          for(let idx=0;idx<currentStreak.length;idx++){
            result.set(currentStreak[idx].kill.id,{isPrecisionStreak:!0,streakId:streakSeq,streakLength:len,streakIndex:idx+1});
          }
        }
        currentStreak=[];
        i--;
      }
    }
    if(currentStreak.length>=2){
      let len=currentStreak.length;++streakSeq;
      for(let idx=0;idx<currentStreak.length;idx++){
        result.set(currentStreak[idx].kill.id,{isPrecisionStreak:!0,streakId:streakSeq,streakLength:len,streakIndex:idx+1});
      }
    }
  }
  return result;
}
function getKillBadge(n){
  let titles=["1K","2K • DOUBLE KILL","3K • TRIPLE KILL","4K • QUADRA KILL","5K • ACE!","6K • SUPER KILL","7K • MONSTER KILL","8K • ULTRA KILL","9K • UNSTOPPABLE","10K • GODLIKE ACE"];
  return n>=1&&n<=10?titles[n-1]:`${n}K • MULTI KILL`;
}
function getWpBadge(k){
  let w=String(k.weaponName??"").toLowerCase();
  if(k.isSsgCollat)return" • COLLAT SCOUT";
  if(k.isPrecisionStreak||k.isOneShotStreak){
    let idx=k.precisionStreakIdx??k.oneShotStreakIdx??1;
    return idx>=2?` • ABATE PRECISO (${idx}x)`:" • ABATE PRECISO";
  }
  if(w.includes("taser")||w.includes("zeus"))return" • ZEUS";
  if(k.weaponType==="knife"||w.includes("knife")||w.includes("bayonet"))return" • FACA";
  if(k.isNoScope)return" • NO-SCOPE";
  if((k.penetratedObjects??0)>=2)return" • WALLBANG";
  if(k.isThroughSmoke)return" • SMOKE";
  return"";
}
function getCircusMusicPath(){
  let csdmPath=R_.default.join(jt(),"circus.mp3");
  if(pT.default.existsSync(csdmPath))return csdmPath;
  let staticPath=R_.default.join(Ki(),"sounds","circus.mp3");
  if(pT.default.existsSync(staticPath))return staticPath;
  let asarAssetPath=R_.default.join(__dirname,"assets","circus.mp3");
  if(pT.default.existsSync(asarAssetPath)){
    try{
      let buf=pT.default.readFileSync(asarAssetPath);
      pT.default.writeFileSync(csdmPath,buf);
      return csdmPath;
    }catch(e){
      return asarAssetPath;
    }
  }
  return "";
}

async function generateIntroVideoWithFFmpeg(cfg,signal){
  let{ffmpegExecutablePath:i,game:h,mapName,matchDate,teamAName,teamAScore,teamBName,teamBScore,players,width,height,framerate:s,outputFolderPath:m,videoContainer:g,videoCodec:c,constantRateFactor:A,audioBitrate:u,outputParameters:d,isLowlight=!1}=cfg;
  let INTRO_DUR=8;
  await pT.default.ensureDir(m);
  let introOut=R_.default.join(m,`intro-0.${g}`),tmpDir=R_.default.join(m,".intro-tmp");
  await pT.default.ensureDir(tmpDir);
  try{
    let staticDir=Ki(),gFolder=h===y.Game.CSGO?"csgo":"cs2",cleanMap=(mapName||"unknown").toLowerCase();
    let mapCands=[
      R_.default.join(staticDir,"images","maps",gFolder,"thumbnails",`${cleanMap}.png`),
      R_.default.join(staticDir,"images","maps","csgo","thumbnails",`${cleanMap}.png`),
      R_.default.join(staticDir,"images","maps","cs2","thumbnails",`${cleanMap}.png`),
      R_.default.join(staticDir,"images","maps","thumbnail_unknown.png")
    ];
    let mapImg="";
    for(let cand of mapCands){if(await pT.default.pathExists(cand)){mapImg=cand;break}}
    let{boldEsc,monoEsc}=getWinFonts();
    let w=Math.max(1280,width||1920),ht=Math.max(720,height||1080),sx=w/1920,sy=ht/1080,rx=v=>Math.round(v*sx),ry=v=>Math.round(v*sy);
    let dateStr="";
    if(matchDate){let dt=new Date(matchDate);if(!Number.isNaN(dt.getTime()))dateStr=`${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`}
    let humanPlayers=(players||[]).filter(p=>{
      if(p.isBot)return!1;
      let sid=String(p.steamId??"");
      if(sid==="0"||(sid!==""&&sid.length<=5))return!1;
      if(/^bot\b/i.test((p.name||"").trim()))return!1;
      return!0;
    });
    let sortKda=(a,b)=>b.killCount!==a.killCount?b.killCount-a.killCount:b.assistCount!==a.assistCount?b.assistCount-a.assistCount:a.deathCount-b.deathCount;
    let sortBagres=(a,b)=>{let da=a.deathCount??0,db=b.deathCount??0;if(db!==da)return db-da;return(parseFloat(a.kd)||0)-(parseFloat(b.kd)||0)};
    let sortFn=isLowlight?sortBagres:sortKda;
    let tAPlayers=humanPlayers.filter(p=>p.teamName===teamAName||p.teamName?.toLowerCase()===teamAName?.toLowerCase()).sort(sortFn).slice(0,10);
    let tBPlayers=humanPlayers.filter(p=>p.teamName===teamBName||p.teamName?.toLowerCase()===teamBName?.toLowerCase()).sort(sortFn).slice(0,10);
    let assigned=new Set([...tAPlayers.map(p=>p.steamId),...tBPlayers.map(p=>p.steamId)]);
    for(let p of humanPlayers){
      if(!assigned.has(p.steamId)){
        if(tAPlayers.length<=tBPlayers.length)tAPlayers.push(p);
        else tBPlayers.push(p);
      }
    }
    tAPlayers.sort(sortFn);
    tBPlayers.sort(sortFn);
    let fmtRow=(p,idx)=>{
      let nm=(p.name||(isLowlight?"Bagre":"Jogador")).replace(/[\r\n\t]/g," ").trim().slice(0,17).padEnd(18," ");
      let k=String(p.killCount??0).padStart(3," "),dt=String(p.deathCount??0).padStart(3," "),as=String(p.assistCount??0).padStart(3," ");
      let kd=((p.killCount??0)/Math.max(1,p.deathCount??0)).toFixed(2).padStart(5," ");
      if(isLowlight){
        return`${String(idx+1).padStart(2,"0")}. ${nm} ${dt} / ${k} / ${as}  ${kd}`;
      }
      return`${String(idx+1).padStart(2,"0")}. ${nm} ${k} / ${dt} / ${as}  ${kd}`;
    };
    let wTxt=(name,txt)=>{let fp=R_.default.join(tmpDir,name);writeCleanTxtSync(fp,txt);return escFfPath(fp)};
    let hdrTxt=isLowlight
      ?(dateStr?`PIORES MOMENTOS (LOWLIGHTS) 🤡  •  MAPA: ${cleanMap.toUpperCase()}  •  ${dateStr}`:`PIORES MOMENTOS (LOWLIGHTS) 🤡  •  MAPA: ${cleanMap.toUpperCase()}`)
      :(dateStr?`HIGHLIGHTS DA PARTIDA  •  MAPA: ${cleanMap.toUpperCase()}  •  ${dateStr}`:`HIGHLIGHTS DA PARTIDA  •  MAPA: ${cleanMap.toUpperCase()}`);
    let scoreTxt=`${teamAName||"TIME A"}     ${teamAScore??0}   x   ${teamBScore??0}     ${teamBName||"TIME B"}`;
    let plJog=n=>`${n} JOGADOR${n===1?"":"ES"}`;
    let tATitle=isLowlight
      ?`${(teamAName||"TIME A").toUpperCase()} - OS MAIORES BAGRES`
      :`${(teamAName||"TIME A").toUpperCase()} (${plJog(tAPlayers.length)})`;
    let tBTitle=isLowlight
      ?`${(teamBName||"TIME B").toUpperCase()} - OS MAIORES BAGRES`
      :`${(teamBName||"TIME B").toUpperCase()} (${plJog(tBPlayers.length)})`;
    let colsHdr=isLowlight
      ?"#   BAGRE                D /   K /   A    K/D"
      :"#   JOGADOR              K /   D /   A    K/D";
    let ftrTxt=isLowlight
      ?"CS DEMO MANAGER CUSTOM  •  RANKING OFICIAL DOS MAIORES BAGRES DA PARTIDA"
      :"CS DEMO MANAGER CUSTOM  •  KDA TOTAL DOS JOGADORES (INCLUINDO BOTS ASSUMIDOS)";
    let fHdr=wTxt("hdr.txt",hdrTxt),fScore=wTxt("score.txt",scoreTxt),fTaT=wTxt("ta_t.txt",tATitle),fTbT=wTxt("tb_t.txt",tBTitle),fCols=wTxt("cols.txt",colsHdr),fFtr=wTxt("ftr.txt",ftrTxt);
    let maxRows=Math.max(tAPlayers.length,tBPlayers.length,1),rowFs=maxRows>8?ry(20):ry(22),rowStep=maxRows>8?ry(36):ry(42),rowStartY=ry(486);
    let topBarColor=isLowlight?"0xef4444@0.95":"0xf59e0b@0.95";
    let hdrColor=isLowlight?"0xf87171":"0xfbbf24";
    let tABoxHdr=isLowlight?"0x7f1d1de0":"0x1e3a8ae0";
    let tABoxBorder=isLowlight?"0xef4444@0.7":"0x3b82f6@0.7";
    let tATitleColor=isLowlight?"0xfca5a5":"0x93c5fd";
    let tBBoxHdr=isLowlight?"0x7c2d12e0":"0x7c2d12e0";
    let tBBoxBorder=isLowlight?"0xf97316@0.7":"0xf97316@0.7";
    let tBTitleColor=isLowlight?"0xfdba74":"0xfdba74";
    let topRowColor=isLowlight?"0xf87171":"0xfef08a";
    let fp=[
      `scale=${w}:${ht}:force_original_aspect_ratio=increase`,
      `crop=${w}:${ht}`,
      "setsar=1:1",
      "gblur=sigma=18",
      "eq=brightness=-0.38:saturation=0.8",
      `drawbox=x=${rx(120)}:y=${ry(48)}:w=${rx(1680)}:h=${ry(100)}:color=0x0d131fe0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(145)}:w=${rx(1680)}:h=${ry(4)}:color=${topBarColor}:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(174)}:w=${rx(1680)}:h=${ry(148)}:color=0x111827e8:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(174)}:w=${rx(1680)}:h=${ry(148)}:color=0x374151@0.8:t=2`,
      `drawbox=x=${rx(120)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=0x0f172ae0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(352)}:w=${rx(815)}:h=${ry(56)}:color=${tABoxHdr}:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=${tABoxBorder}:t=2`,
      `drawbox=x=${rx(985)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=0x0f172ae0:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(352)}:w=${rx(815)}:h=${ry(56)}:color=${tBBoxHdr}:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=${tBBoxBorder}:t=2`,
      `drawtext=fontfile='${boldEsc}':textfile='${fHdr}':fontsize=${ry(36)}:fontcolor=${hdrColor}:x=(w-text_w)/2:y=${ry(82)}`,
      `drawtext=fontfile='${boldEsc}':textfile='${fScore}':fontsize=${ry(60)}:fontcolor=white:x=(w-text_w)/2:y=${ry(222)}`,
      `drawtext=fontfile='${boldEsc}':textfile='${fTaT}':fontsize=${ry(27)}:fontcolor=${tATitleColor}:x=${rx(150)}:y=${ry(368)}`,
      `drawtext=fontfile='${boldEsc}':textfile='${fTbT}':fontsize=${ry(27)}:fontcolor=${tBTitleColor}:x=${rx(1015)}:y=${ry(368)}`,
      `drawtext=fontfile='${monoEsc}':textfile='${fCols}':fontsize=${ry(21)}:fontcolor=0x9ca3af:x=${rx(150)}:y=${ry(432)}`,
      `drawtext=fontfile='${monoEsc}':textfile='${fCols}':fontsize=${ry(21)}:fontcolor=0x9ca3af:x=${rx(1015)}:y=${ry(432)}`,
      `drawbox=x=${rx(145)}:y=${ry(464)}:w=${rx(765)}:h=1:color=0x374151@0.9:t=fill`,
      `drawbox=x=${rx(1010)}:y=${ry(464)}:w=${rx(765)}:h=1:color=0x374151@0.9:t=fill`
    ];
    for(let idx=0;idx<tAPlayers.length;idx++){
      let rf=wTxt(`ta_${idx}.txt`,fmtRow(tAPlayers[idx],idx)),yy=rowStartY+idx*rowStep,col=idx===0?topRowColor:"white";
      fp.push(`drawtext=fontfile='${monoEsc}':textfile='${rf}':fontsize=${rowFs}:fontcolor=${col}:x=${rx(150)}:y=${yy}`);
    }
    for(let idx=0;idx<tBPlayers.length;idx++){
      let rf=wTxt(`tb_${idx}.txt`,fmtRow(tBPlayers[idx],idx)),yy=rowStartY+idx*rowStep,col=idx===0?topRowColor:"white";
      fp.push(`drawtext=fontfile='${monoEsc}':textfile='${rf}':fontsize=${rowFs}:fontcolor=${col}:x=${rx(1015)}:y=${yy}`);
    }
    fp.push(
      `drawtext=fontfile='${boldEsc}':textfile='${fFtr}':fontsize=${ry(21)}:fontcolor=0x9ca3af:x=(w-text_w)/2:y=${ry(965)}`,
      `fps=${s}`,
      `loop=loop=${s*INTRO_DUR}:size=1:start=0`,
      `trim=duration=${INTRO_DUR}`,
      "fade=t=in:st=0:d=0.6",
      `fade=t=out:st=${(INTRO_DUR-0.6).toFixed(1)}:d=0.6`,
      "format=yuv420p"
    );
    let filterFile=R_.default.join(tmpDir,"intro_filter.txt");
    await pT.default.writeFile(filterFile,fp.join(","),"utf8");
    let circusPath=isLowlight?getCircusMusicPath():"";
    let args=["-y"];
    if(mapImg)args.push(`-i "${mapImg}"`);else args.push(`-f lavfi -i "color=c=0x111827:s=${w}x${ht}:r=${s}"`);
    if(isLowlight&&circusPath){
      args.push(
        `-ss 0 -t ${INTRO_DUR} -i "${circusPath}"`,
        `-filter_script:v "${filterFile}"`,
        `-af "afade=t=in:st=0:d=0.5,afade=t=out:st=${(INTRO_DUR-0.6).toFixed(1)}:d=0.6,volume=0.85"`
      );
    }else{
      args.push(
        '-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"',
        `-filter_script:v "${filterFile}"`
      );
    }
    args.push(
      ...getVidCodecArgs(c,A,d,!0),
      "-c:a aac",
      `-b:a ${u}K`,
      `-t ${INTRO_DUR}`,
      "-shortest",
      "-movflags +faststart",
      `"${introOut}"`
    );
    await hg(i,args,signal);
    return introOut;
  }finally{
    await pT.default.remove(tmpDir).catch(()=>{});
  }
}

function getFunnyBagreExcuse(topBagre){
  let name=String(topBagre?.name||"").toLowerCase();
  let seed=(topBagre?.killCount||0)*17+(topBagre?.deathCount||0)*31+(topBagre?.failCount||0)*13;

  if(name.includes("depadua")){
    let cigExcuses=[
      '"Fui bater a cinza do cigarro e queimei a tecla do strafe"',
      '"Caiu brasa do cigarro no mousepad bem na hora da trocacao"',
      '"A fumaca do cigarro entrou no olho bem quando abri o pixel"',
      '"Tava acendendo o cigarro com uma mao e atirando com a outra"',
      '"Fui puxar o cinzeiro na mesa e tomei HS na boca"',
      '"A cinza do cigarro caiu no espaco e meu boneco pulou sozinho"',
      '"Fui dar um trago no meio do bomb e perdi o controle do spray"',
      '"A brasa do cigarro queimou meu dedo bem no recoil"',
      '"Fui acender o cigarro e nao deu tempo de puxar a mira"',
      '"A fumaca do Derby cobriu meu monitor inteiro, parecia smoke"'
    ];
    let idx=Math.abs(seed)%cigExcuses.length;
    return cigExcuses[idx];
  }

  let list=[];
  if(topBagre.whiffs>=1){
    list.push(
      '"Na minha tela pegou 4 na cabeca! Esse 64 tick e piada!"',
      '"O mousepad ta mais engordurado que pastel de feira"',
      '"Certeza que o cara tava de anti-aim, dei 30 tiros nele"',
      '"Minha sensibilidade desconfigurou sozinha bem na hora do spray"'
    );
  }
  if(topBagre.knifeZeusVictim>=1){
    list.push(
      '"Fui olhar o WhatsApp no celular e tomei facada nas costas"',
      '"Achei que o cara com a faca na mao era do meu time"',
      '"Tava limpando a sujeira da tela e nao vi o cara chegando"'
    );
  }
  if(topBagre.suicides>=1){
    list.push(
      '"A molotov quicou na quina de uma parede invisivel"',
      '"Achei que nao dava dano de queda dali, juro por Deus"',
      '"Minha granada bateu na nuca do amigo e voltou na minha cara"'
    );
  }
  if(topBagre.blindDeaths>=1){
    list.push(
      '"Flash de amigo cega mais que olhar pro Sol ao meio-dia"',
      '"Minha tela ficou branca e achei que a luz do quarto tinha acabado"',
      '"Fui inventar de jogar no escuro, tomei flash e fiquei cego de verdade"'
    );
  }
  if(topBagre.clutchesLost>=1){
    list.push(
      '"O gato pulou na mesa e mordeu o fio do mouse no 1v1"',
      '"Meu fone bluetooth desconectou e comecou a tocar funk"',
      '"A pressao do Discord gritando no meu ouvido me desconcentrou"'
    );
  }
  if(topBagre.inspectDeaths>=1){
    list.push(
      '"Tava so conferindo se o float da skin nova valorizou"',
      '"Fui dar uma inspecionada na faca pra ver o brilho e morri"'
    );
  }
  list.push(
    '"Minha mae chamou pra almocar bem na hora da troca"',
    '"Deu uma queda brutal de FPS bem quando abri o pixel, juro!"',
    '"A cadeira gamer estalou e me deu um susto bem na mira"',
    '"O botao esquerdo do mouse afundou e nao subiu mais"',
    '"Meu fone so ta saindo som do lado que nao tinha ninguem"',
    '"O sol bateu na janela e refletiu direto na minha retina"',
    '"O teclado comeu a tecla do strafe bem quando fui abrir"',
    '"Tava com 150 de ping na mente e 20 na tela"'
  );

  let idx=Math.abs(seed)%list.length;
  return list[idx];
}

function wrapTextLines(text, maxLen = 42) {
  let clean = String(text || "").replace(/^"|"$/g, "").trim();
  let words = clean.split(/\s+/);
  let lines = [], cur = "";
  for (let w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + " " + w).length <= maxLen) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function generateOutroVideoWithFFmpeg(cfg,signal){
  let{ffmpegExecutablePath:i,game:h,mapName,teamAName,teamAScore,teamBName,teamBScore,mvp,highlights,showFunAwards=!0,funAwards=[],width,height,framerate:s,outputFolderPath:m,videoContainer:g,videoCodec:c,constantRateFactor:A,audioBitrate:u,outputParameters:d,isLowlight=!1,lowlightsCtx=null}=cfg;
  let effectiveAwards=isLowlight?(lowlightsCtx?.awards&&lowlightsCtx.awards.length>0?lowlightsCtx.awards:funAwards):funAwards;
  let hasFun=Boolean(showFunAwards&&effectiveAwards&&effectiveAwards.length>0);
  let OUTRO_DUR=hasFun?8:6;
  await pT.default.ensureDir(m);
  let outroOut=R_.default.join(m,`outro-0.${g}`),tmpDir=R_.default.join(m,".outro-tmp");
  await pT.default.ensureDir(tmpDir);
  try{
    let staticDir=Ki(),gFolder=h===y.Game.CSGO?"csgo":"cs2",cleanMap=(mapName||"unknown").toLowerCase();
    let mapCands=[
      R_.default.join(staticDir,"images","maps",gFolder,"thumbnails",`${cleanMap}.png`),
      R_.default.join(staticDir,"images","maps","csgo","thumbnails",`${cleanMap}.png`),
      R_.default.join(staticDir,"images","maps","cs2","thumbnails",`${cleanMap}.png`),
      R_.default.join(staticDir,"images","maps","thumbnail_unknown.png")
    ];
    let mapImg="";
    for(let cand of mapCands){if(await pT.default.pathExists(cand)){mapImg=cand;break}}
    let{boldEsc,monoEsc,emojiEsc}=getWinFonts();
    let w=Math.max(1280,width||1920),ht=Math.max(720,height||1080),sx=w/1920,sy=ht/1080,rx=v=>Math.round(v*sx),ry=v=>Math.round(v*sy);
    let wTxt=(name,txt)=>{let fp=R_.default.join(tmpDir,name);writeCleanTxtSync(fp,txt);return escFfPath(fp)};
    let winBanner="";
    if(isLowlight){
      winBanner=`PREMIACAO DOS BAGRES 🤡  •  TROFEU BAGRE DE OURO  •  MAPA: ${cleanMap.toUpperCase()}`;
    }else if(teamAScore>teamBScore){
      winBanner=`VITORIA: ${(teamAName||"TIME A").toUpperCase()} (${teamAScore} x ${teamBScore})  •  MAPA: ${cleanMap.toUpperCase()}`;
    }else if(teamBScore>teamAScore){
      winBanner=`VITORIA: ${(teamBName||"TIME B").toUpperCase()} (${teamBScore} x ${teamAScore})  •  MAPA: ${cleanMap.toUpperCase()}`;
    }else{
      winBanner=`EMPATE: ${(teamAName||"TIME A").toUpperCase()} ${teamAScore} x ${teamBScore} ${(teamBName||"TIME B").toUpperCase()}  •  MAPA: ${cleanMap.toUpperCase()}`;
    }
    let topBagre=lowlightsCtx?.topBagre;
    let fBanner=wTxt("banner.txt",winBanner);
    let fMvpT=wTxt("mvp_t.txt",isLowlight?"TROFEU BAGRE DE OURO 🤡":"MVP DA PARTIDA");
    let fMvpN=wTxt("mvp_n.txt",(isLowlight?(topBagre?.name||"BAGRE"):(mvp?.name||"Jogador")).toUpperCase());
    let fMvpTm=wTxt("mvp_tm.txt",isLowlight?`TIME: ${(topBagre?.teamName||"EQUIPE").toUpperCase()}  •  INIMIGO DA VITORIA`:`TIME: ${(mvp?.teamName||"EQUIPE").toUpperCase()}`);
    let fMvpKda=wTxt("mvp_kda.txt",isLowlight
      ?`KDA: ${topBagre?.killCount??0} / ${topBagre?.deathCount??0} / ${topBagre?.assistCount??0}  (K/D: ${topBagre?.kd??"0.00"})`
      :`KDA: ${mvp?.killCount??0} / ${mvp?.deathCount??0} / ${mvp?.assistCount??0}  (K/D: ${mvp?.kd??"1.00"})`);
    let fMvpHum=wTxt("mvp_hum.txt",isLowlight
      ?`• Mortes Sofridas: ${topBagre?.deathCount??0}`
      :`• Kills em Jogadores Humanos: ${mvp?.humanKills??0}`);
    let fMvpBot=wTxt("mvp_bot.txt",isLowlight
      ?`• Trapalhadas na Partida: ${topBagre?.failCount??0} lances epicos`
      :`• Kills em Bots Assumidos: ${mvp?.botKills??0}`);
    let officialExcuse=isLowlight?getFunnyBagreExcuse(topBagre):"";
    let fMvpHs=isLowlight?"":wTxt("mvp_hs.txt",`• Taxa de Headshot: ${mvp?.hsRate??0}%`);
    let destTitle=isLowlight?"HALL DA VERGONHA & PREMIACOES 🤡":(hasFun?"TROFEUS DA PARTIDA":"DESTAQUES DA PARTIDA");
    let fDestT=wTxt("dest_t.txt",destTitle);
    let fFtr=wTxt("ftr.txt",isLowlight
      ?"CS DEMO MANAGER CUSTOM  •  JOGARAM COMO NUNCA, PERDERAM COMO SEMPRE!"
      :"CS DEMO MANAGER CUSTOM  •  OBRIGADO POR ASSISTIR!");
    let bannerBarColor=isLowlight?"0xef4444@0.95":"0xf59e0b@0.95";
    let bannerFontColor=isLowlight?"0xf87171":"0xfbbf24";
    let leftBoxHdrColor=isLowlight?"0x7f1d1de0":"0x1e3a8ae0";
    let leftBoxBorderColor=isLowlight?"0xef4444@0.7":"0x3b82f6@0.7";
    let leftNameColor=isLowlight?"0xf87171":"0xfef08a";
    let rightBoxHdrColor=isLowlight?"0x7c2d12e0":"0x7c2d12e0";
    let rightBoxBorderColor=isLowlight?"0xf97316@0.7":"0xf97316@0.7";
    let fp=[
      `scale=${w}:${ht}:force_original_aspect_ratio=increase`,
      `crop=${w}:${ht}`,
      "setsar=1:1",
      "gblur=sigma=18",
      "eq=brightness=-0.38:saturation=0.8",
      `drawbox=x=${rx(120)}:y=${ry(48)}:w=${rx(1680)}:h=${ry(100)}:color=0x0d131fe0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(145)}:w=${rx(1680)}:h=${ry(4)}:color=${bannerBarColor}:t=fill`,
      `drawtext=fontfile='${boldEsc}':textfile='${fBanner}':fontsize=${ry(36)}:fontcolor=${bannerFontColor}:x=(w-text_w)/2:y=${ry(82)}`,
      `drawbox=x=${rx(120)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=0x0f172ae8:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(180)}:w=${rx(815)}:h=${ry(58)}:color=${leftBoxHdrColor}:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=${leftBoxBorderColor}:t=2`,
      `drawtext=fontfile='${boldEsc}':textfile='${fMvpT}':fontsize=${ry(28)}:fontcolor=0xfbbf24:x=${rx(160)}:y=${ry(195)}`,
      `drawtext=fontfile='${boldEsc}':textfile='${fMvpN}':fontsize=${ry(42)}:fontcolor=${leftNameColor}:x=${rx(160)}:y=${ry(270)}`,
      `drawtext=fontfile='${boldEsc}':textfile='${fMvpTm}':fontsize=${ry(24)}:fontcolor=0x93c5fd:x=${rx(160)}:y=${ry(325)}`,
      `drawbox=x=${rx(160)}:y=${ry(370)}:w=${rx(735)}:h=1:color=0x374151@0.9:t=fill`,
      `drawtext=fontfile='${boldEsc}':textfile='${fMvpKda}':fontsize=${ry(28)}:fontcolor=white:x=${rx(160)}:y=${ry(400)}`,
      `drawbox=x=${rx(160)}:y=${ry(455)}:w=${rx(735)}:h=1:color=0x374151@0.9:t=fill`,
      `drawtext=fontfile='${boldEsc}':textfile='${fMvpHum}':fontsize=${ry(25)}:fontcolor=0xe2e8f0:x=${rx(160)}:y=${ry(490)}`,
      `drawtext=fontfile='${boldEsc}':textfile='${fMvpBot}':fontsize=${ry(25)}:fontcolor=0x94a3b8:x=${rx(160)}:y=${ry(550)}`
    ];
    if(isLowlight){
      let fExcuseT=wTxt("mvp_exc_t.txt","• Desculpa Oficial:");
      fp.push(`drawtext=fontfile='${boldEsc}':textfile='${fExcuseT}':fontsize=${ry(24)}:fontcolor=0xfbbf24:x=${rx(160)}:y=${ry(610)}`);
      let excLines=wrapTextLines(officialExcuse,42);
      let excY=ry(655);
      for(let li=0;li<excLines.length;li++){
        let pfx=li===0?'"':' ';
        let sfx=li===excLines.length-1?'"':'';
        let lineTxt=`${pfx}${excLines[li]}${sfx}`;
        let fLine=wTxt(`mvp_exc_${li}.txt`,lineTxt);
        fp.push(`drawtext=fontfile='${monoEsc}':textfile='${fLine}':fontsize=${ry(21)}:fontcolor=0xfef08a:x=${rx(190)}:y=${excY}`);
        excY+=ry(36);
      }
    }else{
      fp.push(`drawtext=fontfile='${boldEsc}':textfile='${fMvpHs}':fontsize=${ry(23)}:fontcolor=0xfbbf24:x=${rx(160)}:y=${ry(610)}`);
    }
    fp.push(
      `drawbox=x=${rx(985)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=0x0f172ae8:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(180)}:w=${rx(815)}:h=${ry(58)}:color=${rightBoxHdrColor}:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=${rightBoxBorderColor}:t=2`,
      `drawtext=fontfile='${boldEsc}':textfile='${fDestT}':fontsize=${ry(28)}:fontcolor=0xfbbf24:x=${rx(1025)}:y=${ry(195)}`
    );
    if(hasFun){
      let awardsList=effectiveAwards;
      if(awardsList.length<=5){
        for(let idx=0;idx<awardsList.length;idx++){
          let item=awardsList[idx],destY=ry(265)+idx*ry(115);
          let fTrophy=wTxt(`fa_t_${idx}.txt`,`${item.trophy||item.badge} - ${item.playerName}`),fDesc=wTxt(`fa_d_${idx}.txt`,item.desc);
          fp.push(
            `drawtext=fontfile='${emojiEsc}':textfile='${fTrophy}':fontsize=${ry(25)}:fontcolor=0xfdba74:x=${rx(1025)}:y=${destY}`,
            `drawtext=fontfile='${monoEsc}':textfile='${fDesc}':fontsize=${ry(20)}:fontcolor=white:x=${rx(1045)}:y=${destY+ry(38)}`
          );
          if(idx<awardsList.length-1)fp.push(`drawbox=x=${rx(1025)}:y=${destY+ry(85)}:w=${rx(735)}:h=1:color=0x374151@0.7:t=fill`);
        }
      }else{
        for(let idx=0;idx<Math.min(10,awardsList.length);idx++){
          let item=awardsList[idx],col=Math.floor(idx/5),row=idx%5;
          let colX=col===0?rx(1015):rx(1410),rowY=ry(265)+row*ry(118);
          let fBadge=wTxt(`fa_b_${idx}.txt`,item.badge||item.trophy),fName=wTxt(`fa_n_${idx}.txt`,item.playerName),fDesc=wTxt(`fa_d_${idx}.txt`,item.desc);
          fp.push(
            `drawtext=fontfile='${emojiEsc}':textfile='${fBadge}':fontsize=${ry(21)}:fontcolor=0xfdba74:x=${colX}:y=${rowY}`,
            `drawtext=fontfile='${boldEsc}':textfile='${fName}':fontsize=${ry(20)}:fontcolor=0xfef08a:x=${colX}:y=${rowY+ry(30)}`,
            `drawtext=fontfile='${monoEsc}':textfile='${fDesc}':fontsize=${ry(16)}:fontcolor=white:x=${colX}:y=${rowY+ry(58)}`
          );
          if(row<4&&idx+1<awardsList.length)fp.push(`drawbox=x=${colX}:y=${rowY+ry(98)}:w=${rx(365)}:h=1:color=0x374151@0.5:t=fill`);
        }
      }
    }else{
      let destY=ry(270),dItems=highlights&&highlights.length>0?highlights:[{label:"• MELHOR LANCE DA PARTIDA",value:"Nenhum lance registrado"},{label:"• MAIOR K/D RATIO",value:"N/A"},{label:"• MIRA DE OURO",value:"N/A"},{label:"• CLUTCHER DO JOGO",value:"Nenhum clutch registrado"}];
      for(let idx=0;idx<dItems.length;idx++){
        let it=dItems[idx],fLbl=wTxt(`hl_lbl_${idx}.txt`,it.label),fVal=wTxt(`hl_val_${idx}.txt`,it.value);
        fp.push(
          `drawtext=fontfile='${boldEsc}':textfile='${fLbl}':fontsize=${ry(26)}:fontcolor=0xfdba74:x=${rx(1025)}:y=${destY}`,
          `drawtext=fontfile='${monoEsc}':textfile='${fVal}':fontsize=${ry(23)}:fontcolor=white:x=${rx(1045)}:y=${destY+ry(36)}`
        );
        destY+=ry(96);
        if(idx<dItems.length-1)fp.push(`drawbox=x=${rx(1025)}:y=${destY-ry(20)}:w=${rx(735)}:h=1:color=0x374151@0.7:t=fill`);
      }
    }
    fp.push(
      `drawtext=fontfile='${boldEsc}':textfile='${fFtr}':fontsize=${ry(22)}:fontcolor=0x9ca3af:x=(w-text_w)/2:y=${ry(965)}`,
      `fps=${s}`,
      `loop=loop=${s*OUTRO_DUR}:size=1:start=0`,
      `trim=duration=${OUTRO_DUR}`,
      "fade=t=in:st=0:d=0.5",
      `fade=t=out:st=${(OUTRO_DUR-0.5).toFixed(1)}:d=0.5`,
      "format=yuv420p"
    );
    let filterFile=R_.default.join(tmpDir,"outro_filter.txt");
    await pT.default.writeFile(filterFile,fp.join(","),"utf8");
    let circusPath=isLowlight?getCircusMusicPath():"";
    let args=["-y"];
    if(mapImg)args.push(`-i "${mapImg}"`);else args.push(`-f lavfi -i "color=c=0x111827:s=${w}x${ht}:r=${s}"`);
    if(isLowlight&&circusPath){
      args.push(
        `-ss 10 -t ${OUTRO_DUR} -i "${circusPath}"`,
        `-filter_script:v "${filterFile}"`,
        `-af "afade=t=in:st=0:d=0.5,afade=t=out:st=${(OUTRO_DUR-0.6).toFixed(1)}:d=0.6,volume=0.85"`
      );
    }else{
      args.push(
        '-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"',
        `-filter_script:v "${filterFile}"`
      );
    }
    args.push(
      ...getVidCodecArgs(c,A,d,!0),
      "-c:a aac",
      `-b:a ${u}K`,
      `-t ${OUTRO_DUR}`,
      "-shortest",
      "-movflags +faststart",
      `"${outroOut}"`
    );
    await hg(i,args,signal);
    return outroOut;
  }finally{
    await pT.default.remove(tmpDir).catch(()=>{});
  }
}

async function hIe(t,e){
  logger.debug("Generating video with FFmpeg"),logger.debug(t);
  let{tgaFiles:r,wavFilePath:n,videoFilePath:o}=await hT(t);
  let{ffmpegExecutablePath:i,framerate:s,targetFramerate:tfInput,tickrate:tk=64,inputParameters:a,videoCodec:c,audioCodec:l,audioBitrate:u,constantRateFactor:A,outputParameters:d,recordingSystem:f,game:h,sequence:H,outputFolderPath:m,videoContainer:g,recordingOutput:E,recordAudio:_,hudPosition:hudPos="top-left",enableSequenceTransitions:enTrans=!0,enableKillCounter:enKills=!0,enableSlowMotion:enSlow=!0,enableFastForward:enFast=!0,sequenceKills:seqKills=[],clutches:seqClutches=[]}=t;
  let tfps=tfInput||Math.min(s,60);
  await pT.default.ensureDir(m);
  let b=fg(m,H,g),tmpHudDir=R_.default.join(m,`.hud-tmp-${H.number}`);
  let rawSeqDur=Math.max(0.5,(H.endTick-H.startTick)/Math.max(1,tk));
  let sortedCams=Array.isArray(H.playerCameras)?[...H.playerCameras].sort((x,y)=>x.tick-y.tick):[];
  let kills=Array.isArray(seqKills)?[...seqKills].sort((x,y)=>x.tick-y.tick):[];
  let slowMo=null;
  if(H.isLowlight&&enSlow){
    let fTick=H.lowlightTick||(kills.length>0?kills[0].tick:null);
    if(fTick){
      let kSec=(fTick-H.startTick)/Math.max(1,tk),sSt=Math.max(0.2,kSec-0.5),sEn=Math.min(rawSeqDur-0.2,kSec+1.0);
      if(sEn-sSt>=0.8)slowMo={startSec:sSt,endSec:sEn,speed:0.5,extraSec:sEn-sSt,tick:fTick};
    }
  }else if(enSlow&&kills.length>0){
    let best=null,bSc=-1;
    for(let k of kills){
      let isClutch=seqClutches.some(cl=>cl.won&&cl.roundNumber===k.roundNumber&&cl.clutcherSteamId===k.killerSteamId);
      let wName=String(k.weaponName??"").toLowerCase();
      let sc=0;
      if(k.isNoScope)sc+=50;
      if(k.isSsgCollat)sc+=55;
      if(k.isPrecisionStreak||k.isOneShotStreak)sc+=50;
      if(k.weaponType==="knife"||wName.includes("knife")||wName.includes("bayonet"))sc+=60;
      if(wName.includes("taser")||wName.includes("zeus"))sc+=60;
      if((k.penetratedObjects??0)>=2)sc+=40;
      if(isClutch&&(seqClutches.find(cl=>cl.roundNumber===k.roundNumber)?.opponentCount??0)>=2)sc+=45;
      if(sc>bSc){bSc=sc;best=k}
    }
    if(best&&bSc>0){
      let kSec=(best.tick-H.startTick)/Math.max(1,tk),sSt=Math.max(0.2,kSec-0.5),sEn=Math.min(rawSeqDur-0.2,kSec+1);
      if(sEn-sSt>=0.8)slowMo={startSec:sSt,endSec:sEn,speed:0.5,extraSec:sEn-sSt,tick:best.tick};
    }
  }
  let ffIntervals=[];
  if(enFast&&kills.length>1){
    for(let i=0;i<kills.length-1;i++){
      let k1=kills[i],k2=kills[i+1];
      let w1=String(k1.weaponName??k1.weapon_name??"").toLowerCase();
      let w2=String(k2.weaponName??k2.weapon_name??"").toLowerCase();
      if(isExcludedWeaponForStreak(w1)||isExcludedWeaponForStreak(w2))continue;
      let gapSec=(k2.tick-k1.tick)/Math.max(1,tk);
      if(gapSec>5){
        let ffSt=(k1.tick-H.startTick)/Math.max(1,tk)+1.0;
        let ffEn=(k2.tick-H.startTick)/Math.max(1,tk)-2.0;
        if(ffEn>ffSt+1.0&&ffSt>0.2&&ffEn<rawSeqDur-0.2){
          ffIntervals.push({startSec:ffSt,endSec:ffEn,speed:2.0});
        }
      }
    }
  }
  let speedIntervals=[...ffIntervals];
  if(slowMo)speedIntervals.push(slowMo);
  let{segments,totalOutDuration}=buildSpeedSegments(rawSeqDur,speedIntervals);
  let hasSpeedChanges=segments.some(seg=>seg.speed!==1.0);
  let isHighFps=(s>=100||tfps>=100||segments.some(seg=>seg.speed===0.5));
  let seqDur=totalOutDuration;
  let fadeDur=Math.min(0.35,seqDur/4),fadeOutSt=Math.max(0,seqDur-fadeDur);
  let adjT=t0=>{
    if(segments.length<=1&&segments[0]?.speed===1.0)return t0;
    for(let seg of segments){
      if(t0>=seg.rawStart&&t0<=seg.rawEnd){
        return seg.outStart+(t0-seg.rawStart)/seg.speed;
      }
    }
    if(t0<segments[0].rawStart)return t0;
    let last=segments[segments.length-1];
    return last.outEnd+(t0-last.rawEnd);
  };
  let buildHud=async()=>{
    await pT.default.ensureDir(tmpHudDir);
    let{boldEsc}=getWinFonts(),hudVf=[],itIdx=0;
    if(hudPos&&hudPos!=="none"&&sortedCams.length>0){
      for(let idx=0;idx<sortedCams.length;idx++){
        let cam=sortedCams[idx],pName=(cam.playerName||"").trim();
        if(!pName)continue;
        let rNum=cam.roundNumber??H.roundNumber,basePov=rNum?`POV: ${pName} - Round ${rNum}`:`POV: ${pName}`;
        let camStartTick=idx===0?H.startTick:cam.tick,camEndTick=idx<sortedCams.length-1?sortedCams[idx+1].tick:H.endTick;
        let cStRaw=Math.max(0,(camStartTick-H.startTick)/Math.max(1,tk));
        let cEnRaw=idx<sortedCams.length-1?Math.max(cStRaw+0.1,(camEndTick-H.startTick)/Math.max(1,tk)):rawSeqDur+30;
        let cKills=kills.filter(k=>k.killerSteamId===cam.playerSteamId&&k.tick>=camStartTick&&k.tick<camEndTick+64);
        let intervals=[];
        if(H.isLowlight||cam.isLowlight||H.lowlightBadge){
          let badge=H.lowlightBadge||cam.lowlightBadge||"🤡 TRAPALHADA DA PARTIDA";
          let bColor="0xef4444cc",bWidth=3;
          intervals.push({rawStart:cStRaw,rawEnd:cEnRaw,text:`${basePov}  |  ${badge}`,borderColor:bColor,borderWidth:bWidth,isLowlight:true});
        }else if(!enKills||cKills.length===0){
          intervals.push({rawStart:cStRaw,rawEnd:cEnRaw,text:basePov,borderColor:"0x3b82f688",borderWidth:2});
        }else{
          let firstSec=(cKills[0].tick-H.startTick)/Math.max(1,tk);
          if(firstSec>cStRaw+0.05)intervals.push({rawStart:cStRaw,rawEnd:firstSec,text:basePov,borderColor:"0x3b82f688",borderWidth:2});
          for(let kIdx=0;kIdx<cKills.length;kIdx++){
            let k=cKills[kIdx],kCount=kIdx+1;
            let kStSec=(k.tick-H.startTick)/Math.max(1,tk);
            let kEnSec=kIdx<cKills.length-1?(cKills[kIdx+1].tick-H.startTick)/Math.max(1,tk):cEnRaw;
            let badge=getKillBadge(kCount)+getWpBadge(k);
            if(kIdx===cKills.length-1){
              let wc=seqClutches.find(cl=>cl.won&&cl.roundNumber===rNum&&cl.clutcherSteamId===cam.playerSteamId&&cl.opponentCount>=1);
              if(wc)badge+=` [CLUTCH 1v${wc.opponentCount} VENCIDO]`;
            }
            let bColor="0x3b82f688",bWidth=2;
            if(kCount===2||kCount===3){bColor="0xf59e0bcc";bWidth=3}else if(kCount>=4){bColor="0xef4444cc";bWidth=3}
            intervals.push({rawStart:kStSec,rawEnd:kEnSec,text:`${basePov}  |  ${badge}`,borderColor:bColor,borderWidth:bWidth});
          }
        }
        if(ffIntervals.length>0){
          intervals=splitIntervalsWithFastForward(intervals,ffIntervals,basePov);
        }
        for(let it of intervals){
          let adjSt=adjT(it.rawStart),adjEn=adjT(it.rawEnd);
          let lblFile=R_.default.join(tmpHudDir,`hud_${itIdx++}.txt`);
          writeCleanTxtSync(lblFile,it.text);
          let escLbl=escFfPath(lblFile);
          let enExpr=`:enable='between(t,${adjSt.toFixed(2)},${adjEn.toFixed(2)})'`;
          let boxW=Math.max(360,Math.min(1180,Math.round(it.text.length*13.5+56))),boxH=54,boxX="36",boxY="36",txtX="58",txtY="51";
          if(hudPos==="bottom-left"){boxX="36";boxY=`ih-${boxH+36}`;txtX="58";txtY=`h-${boxH+21}`}
          else if(hudPos==="bottom-right"){boxX=`iw-${boxW}-36`;boxY=`ih-${boxH+36}`;txtX=`w-${boxW}-14`;txtY=`h-${boxH+21}`}
          else if(hudPos==="top-center"){boxX=`(iw-${boxW})/2`;boxY="36";txtX=`(w-${boxW})/2+22`;txtY="51"}
          else if(hudPos==="top-right"){boxX=`iw-${boxW}-36`;boxY="36";txtX=`w-${boxW}-14`;txtY="51"}
          hudVf.push(
            `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=0x0d131fcc:t=fill${enExpr}`,
            `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${it.borderColor}:t=${it.borderWidth}${enExpr}`,
            `drawbox=x=${boxX}:y=${boxY}:w=6:h=${boxH}:color=${it.isLowlight?"0xef4444@1.0":"0xf59e0b@1.0"}:t=fill${enExpr}`,
            `drawtext=fontfile='${boldEsc}':textfile='${escLbl}':fontsize=23:fontcolor=white:shadowcolor=black@0.85:shadowx=2:shadowy=2:x=${txtX}:y=${txtY}${enExpr}`
          );
        }
      }
    }
    return hudVf;
  };
  try{
    let hudVf=await buildHud();
    if(hasSpeedChanges&&segments.length>1){
      let slowPtsExpr=(s>=100)?`setpts=N/(${tfps}*TB),fps=fps=${tfps}:round=near`:`setpts=2.0*(PTS-STARTPTS),fps=fps=${tfps}:round=near`;
      let vBase=[],aBase=[];
      for(let j=0;j<segments.length;j++){
        let seg=segments[j];
        let sStart=seg.rawStart.toFixed(3),sEnd=seg.rawEnd.toFixed(3);
        if(seg.speed===2.0){
          vBase.push(`[0:v]trim=start=${sStart}:end=${sEnd},setpts=0.5*(PTS-STARTPTS),fps=fps=${tfps}:round=near[v${j}]`);
          aBase.push(`[1:a]atrim=start=${sStart}:end=${sEnd},asetpts=PTS-STARTPTS,atempo=2.0[a${j}]`);
        }else if(seg.speed===0.5){
          vBase.push(`[0:v]trim=start=${sStart}:end=${sEnd},${slowPtsExpr}[v${j}]`);
          aBase.push(`[1:a]atrim=start=${sStart}:end=${sEnd},asetpts=PTS-STARTPTS,atempo=0.5[a${j}]`);
        }else{
          vBase.push(`[0:v]trim=start=${sStart}:end=${sEnd},setpts=PTS-STARTPTS,fps=fps=${tfps}:round=near[v${j}]`);
          aBase.push(`[1:a]atrim=start=${sStart}:end=${sEnd},asetpts=PTS-STARTPTS[a${j}]`);
        }
      }
      let vCatIn=segments.map((_,idx)=>`[v${idx}]`).join("");
      let aCatIn=segments.map((_,idx)=>`[a${idx}]`).join("");
      vBase.push(`${vCatIn}concat=n=${segments.length}:v=1:a=0[vcat]`);
      aBase.push(`${aCatIn}concat=n=${segments.length}:v=0:a=1[acat]`);
      let vOut=["setsar=1:1",...hudVf];
      if(enTrans)vOut.push(`fade=t=in:st=0:d=${fadeDur.toFixed(2)}`,`fade=t=out:st=${fadeOutSt.toFixed(2)}:d=${fadeDur.toFixed(2)}`);
      vOut.push(`fps=fps=${tfps}:round=near`,"format=yuv420p");
      let aOut=["aresample=async=1:first_pts=0"];
      if(enTrans)aOut.push(`afade=t=in:st=0:d=${fadeDur.toFixed(2)}`,`afade=t=out:st=${fadeOutSt.toFixed(2)}:d=${fadeDur.toFixed(2)}`);
      let fullComp=[...vBase,`[vcat]${vOut.join(",")}[vout]`,...aBase,`[acat]${aOut.join(",")}[aout]`].join(";\n");
      let compPath=R_.default.join(tmpHudDir,`filter_comp_${H.number}.txt`);
      await pT.default.writeFile(compPath,fullComp,"utf8");
      let w=["-y","-hwaccel auto"];
      a!==""&&w.push(a);
      let hasAud=Boolean(_&&n&&await pT.default.pathExists(n));
      if(f===Br.HLAE&&E===Pr.Video){
        if(!o)throw logger.error("Video file path is null for HLAE video output"),new Xs;
        w.push(`-i "${o}"`);
      }else{
        let rawPattern,rawDir=R_.default.dirname(r[0]);
        if(f===Br.HLAE)rawPattern=R_.default.join(rawDir,"%05d.tga");else{let seqNm=On(H);rawPattern=R_.default.join(rawDir,h===y.Game.CSGO?`${seqNm}%04d.tga`:`${seqNm}%08d.tga`)}
        w.push(`-framerate ${s}`,`-i "${rawPattern}"`);
      }
      if(hasAud&&n)w.push(`-i "${n}"`);else w.push('-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"');
      w.push(`-filter_complex_script "${compPath}"`,'-map "[vout]"','-map "[aout]"',...getVidCodecArgs(c,A,d,isHighFps),"-c:a aac",`-b:a ${u}K`,"-shortest","-movflags +faststart",`"${b}"`);
      return await hg(i,w,e);
    }
    let vf=["setsar=1:1",...hudVf];
    if(enTrans)vf.push(`fade=t=in:st=0:d=${fadeDur.toFixed(2)}`,`fade=t=out:st=${fadeOutSt.toFixed(2)}:d=${fadeDur.toFixed(2)}`);
    vf.push(`fps=fps=${tfps}:round=near`,"format=yuv420p");
    let fScript=R_.default.join(tmpHudDir,`filter_seq_${H.number}.txt`);
    await pT.default.writeFile(fScript,vf.join(","),"utf8");
    let afFilter=enTrans?`aresample=async=1:first_pts=0,afade=t=in:st=0:d=${fadeDur.toFixed(2)},afade=t=out:st=${fadeOutSt.toFixed(2)}:d=${fadeDur.toFixed(2)}`:"aresample=async=1:first_pts=0";
    if(f===Br.HLAE&&E===Pr.Video){
      if(!o)throw logger.error("Video file path is null for HLAE video output"),new Xs;
      let w=["-y","-hwaccel auto"];
      a!==""&&w.push(a);
      w.push(`-i "${o}"`);
      let O=Boolean(_&&n&&await pT.default.pathExists(n));
      if(O){
        if(g==="mp4"||l.toLowerCase().includes("aac")){
          w.push(`-i "${n}"`,"-map 0:v:0","-map 1:a:0",`-filter_script:v "${fScript}"`,...getVidCodecArgs(c,A,d,isHighFps),"-c:a aac",`-b:a ${u}K`,`-af "${afFilter}"`,"-shortest","-movflags +faststart");
        }else{
          let te=await Jgt(i,n,l,u,e);
          w.push(`-i "${te}"`,"-map 0:v:0","-map 1:a:0",`-filter_script:v "${fScript}"`,...getVidCodecArgs(c,A,d,isHighFps),"-c:a copy","-shortest");
        }
      }else{
        w.push('-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"',"-map 0:v:0","-map 1:a:0",`-filter_script:v "${fScript}"`,...getVidCodecArgs(c,A,d,isHighFps),"-c:a aac",`-b:a ${u}K`,"-shortest","-movflags +faststart");
      }
      w.push(`"${b}"`);
      return await hg(i,w,e);
    }
    let D,$=R_.default.dirname(r[0]);
    if(f===Br.HLAE)D=R_.default.join($,"%05d.tga");else{let w=On(H);D=R_.default.join($,h===y.Game.CSGO?`${w}%04d.tga`:`${w}%08d.tga`)}
    let N=["-y","-hwaccel auto",`-framerate ${s}`];
    a!==""&&N.push(a);
    N.push(`-i "${D}"`);
    let U=n?await pT.default.pathExists(n):!1,B=_&&U;
    B&&N.push(`-i "${n}"`);
    N.push(`-filter_script:v "${fScript}"`,...getVidCodecArgs(c,A,d,isHighFps));
    B&&N.push(`-acodec ${l}`,`-b:a ${u}K`,`-af "${afFilter}"`);
    N.push(`"${b}"`);
    await hg(i,N,e);
  }finally{
    await pT.default.remove(tmpHudDir).catch(()=>{});
  }
}
function computeFunPlayerAwards(players,kills,clutches,mapName){
  let cleanMap=(mapName||"").toLowerCase();
  let ssgCollatMap=new Map();
  for(let k of kills){
    let w=String(k.weapon_name??k.weaponName??"").toLowerCase();
    let sid=String(k.killer_steam_id??k.killerSteamId??"");
    let rnd=k.round_number??k.roundNumber;
    if((w.includes("ssg")||w.includes("scout"))&&sid){
      let key=`${rnd}:${sid}:${k.tick}`;
      ssgCollatMap.set(key,(ssgCollatMap.get(key)??0)+1);
    }
  }
  let playerStats=players.map(p=>{
    let sid=String(p.steamId??"");
    let pKills=kills.filter(k=>String(k.killer_steam_id??"")===sid);
    let pDeaths=kills.filter(k=>String(k.victim_steam_id??"")===sid);
    let totalK=pKills.length,totalD=pDeaths.length,ast=p.assistCount??0;
    let wb=pKills.filter(k=>Number(k.penetrated_objects??0)>0).length;
    let hs=pKills.filter(k=>Boolean(k.is_headshot)).length;
    let smk=pKills.filter(k=>Boolean(k.is_through_smoke)).length;
    let zeus=pKills.filter(k=>{let w=String(k.weapon_name??"").toLowerCase();return w.includes("taser")||w.includes("zeus")}).length;
    let knf=pKills.filter(k=>{let w=String(k.weapon_name??"").toLowerCase();return k.weapon_type==="knife"||w.includes("knife")||w.includes("bayonet")}).length;
    let snp=pKills.filter(k=>{let w=String(k.weapon_name??"").toLowerCase();return k.weapon_type==="sniper"||["awp","ssg08","scar20","g3sg1"].includes(w)}).length;
    let ns=pKills.filter(k=>Boolean(k.is_no_scope)).length;
    let blnd=pKills.filter(k=>Boolean(k.is_killer_blinded)).length;
    let air=pKills.filter(k=>Boolean(k.is_killer_airborne)).length;
    let grn=pKills.filter(k=>{let w=String(k.weapon_name??"").toLowerCase();return k.weapon_type==="grenade"||["hegrenade","inferno","molotov"].includes(w)}).length;
    let bot=pKills.filter(k=>Boolean(k.is_killer_controlling_bot)).length;
    let trd=pKills.filter(k=>Boolean(k.is_trade_kill)).length;
    let clCount=clutches.filter(c=>String(c.clutcher_steam_id??"")===sid&&c.won).length;
    let blndDeaths=pDeaths.filter(k=>Boolean(k.is_victim_blinded)).length;
    let precKills=pKills.filter(k=>Boolean(k.isPrecisionStreak||k.isOneShotStreak)).length;
    let ssgCollat=pKills.filter(k=>{
      let rnd=k.round_number??k.roundNumber;
      return (ssgCollatMap.get(`${rnd}:${sid}:${k.tick}`)??0)>=2;
    }).length;
    let hsPct=totalK>0?Math.round((hs/totalK)*100):0,wbPct=totalK>0?Math.round((wb/totalK)*100):0,snpPct=totalK>0?Math.round((snp/totalK)*100):0;
    return{player:p,sid,name:p.name||"Jogador",totalK,totalD,ast,wb,wbPct,hs,hsPct,smk,zeus,knf,snp,snpPct,ns,blnd,air,grn,bot,trd,clCount,blndDeaths,ssgCollat,precKills,oneShotKills:precKills};
  });
  let pool=[];
  for(let s of playerStats){
    let cands=[];
    if(s.wb>=1){
      let sc=s.wbPct>=20?110+s.wb*10:70+s.wb*8;
      let d=cleanMap.includes("dust")?`${s.wb} kill(s) varando a porta da Dust II`:`${s.wb} kill(s) varando portas e paredes`;
      cands.push({id:"porta_esperanca",badge:"Porta da Esperanca 🚪",title:"Trofeu Porta da Esperanca 🚪",desc:d,score:sc});
    }
    if(s.zeus>=1)cands.push({id:"pikachu",badge:"Pikachu ⚡",title:"Trofeu Pikachu ⚡",desc:`${s.zeus} choque(s) de alta voltagem no Zeus`,score:120+s.zeus*20});
    if(s.knf>=1)cands.push({id:"traira",badge:"Traira 🐟",title:"Trofeu Traira 🐟",desc:`${s.knf} facada(s) traira pelas costas`,score:115+s.knf*15});
    if(s.smk>=1)cands.push({id:"bob_marley",badge:"Bob Marley 💨",title:"Trofeu Bob Marley 💨",desc:`${s.smk} kill(s) na pura brisa dentro da smoke`,score:95+s.smk*15});
    if(s.hs>=2&&s.hsPct>=35)cands.push({id:"cearense_lover",badge:"Cearense Lover 🤕",title:"Trofeu Cearense Lover 🤕",desc:`So na cabecinha: ${s.hsPct}% HS (${s.hs} tiros no coco)`,score:s.hsPct*1.2+s.hs*2});
    if(s.snp>=3&&s.snpPct>=35)cands.push({id:"handicap",badge:"Handicap 💺",title:"Trofeu Handicap 💺",desc:`So mata sentadinho: ${s.snp} kills de AWP/Sniper`,score:80+s.snp*4});
    if(s.blnd>=1)cands.push({id:"pombo_cego",badge:"Pombo Cego 🕊️",title:"Trofeu Pombo Cego 🕊️",desc:`${s.blnd} kill(s) no escuro total (100% cego)`,score:90+s.blnd*12});
    if(s.air>=1)cands.push({id:"saci_perere",badge:"Saci Perere 🦘",title:"Trofeu Saci Perere 🦘",desc:`${s.air} kill(s) voando pelo mapa no ar`,score:85+s.air*12});
    if(s.precKills>=2)cands.push({id:"john_wick",badge:"John Wick 🎯",title:"Trofeu John Wick 🎯",desc:`Mao firme: ${s.precKills} abates precisos seguidos (1-2 tiros por vitima)`,score:125+s.precKills*20});
    if(s.ssgCollat>=1)cands.push({id:"dois_coelhos",badge:"Dois Coelhos 🐇",title:"Trofeu Dois Coelhos 🐇",desc:`2 em 1: collat com 1 tiro de Scout (${s.ssgCollat}x)`,score:130+s.ssgCollat*25});
    if(s.ns>=1)cands.push({id:"no_scope",badge:"Sem Mira 🎯",title:"Trofeu Sem Mira 🎯",desc:`${s.ns} no-scope(s) de sniper a queima-roupa`,score:85+s.ns*10});
    if(s.grn>=1)cands.push({id:"churrasqueiro",badge:"Churrasqueiro 🔥",title:"Trofeu Churrasqueiro 🔥",desc:`${s.grn} assado(s) na molotov ou HE`,score:80+s.grn*10});
    if(s.clCount>=1)cands.push({id:"clutcher",badge:"Clutcher de Aco 🦾",title:"Trofeu Clutcher de Aco 🦾",desc:`Gelo no sangue: venceu ${s.clCount} clutch(es)`,score:100+s.clCount*20});
    if(s.bot>=1)cands.push({id:"ladrao_bot",badge:"Ladrao de Bot 🤖",title:"Trofeu Ladrao de Bot 🤖",desc:`Assumiu o bot e fez ${s.bot} kills marotas`,score:75+s.bot*10});
    if(s.ast>=2)cands.push({id:"garcom",badge:"Garcom da Rodada 🍽️",title:"Trofeu Garcom da Rodada 🍽️",desc:`Serviu ${s.ast} assistencias de bandeja pro time`,score:50+s.ast*8});
    if(s.trd>=2)cands.push({id:"papador",badge:"Papador de Kill 🦹",title:"Trofeu Papador de Kill 🦹",desc:`Aproveitou a deixa: ${s.trd} trade kills miadas`,score:55+s.trd*6});
    if(s.totalK>=8)cands.push({id:"exterminador",badge:"O Exterminador 💀",title:"Trofeu O Exterminador 💀",desc:`Maquina mortifera com ${s.totalK} abates`,score:s.totalK*4});
    if(s.totalD<=8)cands.push({id:"sobrevivente",badge:"O Sobrevivente 🐢",title:"Trofeu O Sobrevivente 🐢",desc:`Escondidinho na base: so ${s.totalD} mortes`,score:(25-s.totalD)*3});
    if(s.totalD>=8)cands.push({id:"saco_pancadas",badge:"Saco de Pancadas 🥊",title:"Trofeu Saco de Pancadas 🥊",desc:`Caiu de pe: tomou ${s.totalD} mortes com bravura`,score:35+s.totalD*2});
    if(s.blndDeaths>=1)cands.push({id:"oculos_escuros",badge:"Oculos Escuros 🕶️",title:"Trofeu Oculos Escuros 🕶️",desc:`Nao viu de onde veio: morreu cego ${s.blndDeaths}x`,score:40+s.blndDeaths*8});
    cands.push({id:"mascote",badge:"Mascote da Turma 🥬",title:"Trofeu Mascote da Turma 🥬",desc:"Jogou com amor e garantiu a resenha no Discord",score:10});
    for(let c of cands)pool.push({sid:s.sid,name:s.name,award:c,score:c.score});
  }
  pool.sort((a,b)=>b.score-a.score);
  let assignedP=new Set(),assignedT=new Set(),finalAwards=[];
  for(let c of pool){
    if(!assignedP.has(c.sid)&&!assignedT.has(c.award.id)){
      assignedP.add(c.sid);
      assignedT.add(c.award.id);
      finalAwards.push({steamId:c.sid,playerName:c.name,trophy:c.award.title,badge:c.award.badge,desc:c.award.desc});
    }
  }
  for(let s of playerStats){
    if(!assignedP.has(s.sid)){
      finalAwards.push({steamId:s.sid,playerName:s.name,trophy:"Trofeu Mascote da Turma 🥬",badge:"Mascote da Turma 🥬",desc:"Jogou com amor e garantiu a resenha no Discord"});
      assignedP.add(s.sid);
    }
  }
  return finalAwards;
}

function isLowlightPistol(weaponName){
  let w=String(weaponName||"").toLowerCase().replace(/[-_ ]/g,"");
  return ["glock","deagle","deserteagle","beretta","dual","elite","fiveseven","p2000","hkp2000","p250","tec9","usp","cz75","revolver"].some(p=>w.includes(p));
}

function computeLowlightsAwards(players, kills, clutches, shots, damages, mapName) {
  let cleanMap = (mapName || "").toLowerCase();
  let playerBagreStats = (players || []).map(p => {
    let sid = String(p.steamId ?? p.steam_id ?? "");
    let pKills = (kills || []).filter(k => String(k.killer_steam_id ?? k.killerSteamId ?? "") === sid);
    let pDeaths = (kills || []).filter(k => String(k.victim_steam_id ?? k.victimSteamId ?? "") === sid);
    let totalK = p.killCount ?? pKills.length, totalD = p.deathCount ?? pDeaths.length, ast = p.assistCount ?? 0;
    let kd = (totalK / Math.max(1, totalD)).toFixed(2);

    let knifeZeusVictim = pDeaths.filter(k => {
      let w = String(k.weapon_name ?? k.weaponName ?? "").toLowerCase();
      let wt = String(k.weapon_type ?? k.weaponType ?? "").toLowerCase();
      return wt === "melee" || wt === "knife" || w.includes("knife") || w.includes("bayonet") || w.includes("taser") || w.includes("zeus");
    }).length;

    let suicides = pDeaths.filter(k => {
      let kid = String(k.killer_steam_id ?? k.killerSteamId ?? "");
      let w = String(k.weapon_name ?? k.weaponName ?? "").toLowerCase();
      let wt = String(k.weapon_type ?? k.weaponType ?? "").toLowerCase();
      return (kid === sid && kid !== "0") || wt === "world" || w.includes("world");
    }).length;

    let clutchesLost = (clutches || []).filter(c => !c.won && (c.opponent_count ?? c.opponentCount) === 1 && String(c.clutcher_steam_id ?? c.clutcherSteamId ?? "") === sid).length;
    let blindDeaths = pDeaths.filter(k => Boolean(k.is_victim_blinded ?? k.isVictimBlinded)).length;
    let inspectDeaths = pDeaths.filter(k => Boolean(k.is_victim_inspecting_weapon ?? k.isVictimInspectingWeapon)).length;

    let whiffs = 0;
    for (let k of pDeaths) {
      let rNum = k.round_number ?? k.roundNumber;
      let pShots = (shots || []).filter(s => (s.round_number ?? s.roundNumber) === rNum && String(s.player_steam_id ?? s.playerSteamId ?? "") === sid && s.tick >= k.tick - 192 && s.tick <= k.tick);
      let gunShots = pShots.filter(s => !["knife", "bayonet", "taser", "flashbang", "smoke", "hegrenade", "molotov", "decoy"].some(x => String(s.weapon_name ?? s.weaponName ?? "").toLowerCase().includes(x)));
      if (gunShots.length > 0) {
        let mainWp = gunShots[0].weapon_name ?? gunShots[0].weaponName ?? "";
        let minShots = isLowlightPistol(mainWp) ? 8 : 16;
        if (gunShots.length >= minShots) {
          let pDmg = (damages || []).filter(d => (d.round_number ?? d.roundNumber) === rNum && String(d.attacker_steam_id ?? d.attackerSteamId ?? "") === sid && d.tick >= k.tick - 192 && d.tick <= k.tick);
          let totalDmg = pDmg.reduce((acc, d) => acc + (d.health_damage ?? d.healthDamage ?? 0), 0);
          if (totalDmg <= 20) whiffs++;
        }
      }
    }

    let failCount = knifeZeusVictim * 3 + suicides * 3 + clutchesLost * 2 + whiffs * 2 + blindDeaths + inspectDeaths;
    let bagreScore = totalD * 3 - totalK * 2 + failCount * 4;

    return {
      player: p,
      sid,
      name: p.name || "Jogador",
      teamName: p.teamName || p.team_name || "Equipe",
      killCount: totalK,
      deathCount: totalD,
      assistCount: ast,
      kd,
      knifeZeusVictim,
      suicides,
      clutchesLost,
      blindDeaths,
      inspectDeaths,
      whiffs,
      failCount,
      bagreScore
    };
  });

  playerBagreStats.sort((a, b) => b.bagreScore - a.bagreScore);
  let topBagre = playerBagreStats[0] || { name: "Jogador", teamName: "Equipe", killCount: 0, deathCount: 0, assistCount: 0, kd: "1.00", failCount: 0, bagreScore: 0 };

  let pool = [];
  for (let s of playerBagreStats) {
    let cands = [];
    if (s.knifeZeusVictim >= 1) cands.push({ id: "vitima_faca", badge: "Ima de Faca 🔪", title: "Trofeu Ima de Faca 🔪", desc: "Vitima preferida: tomou " + s.knifeZeusVictim + " facada(s)/choque(s)", score: 120 + s.knifeZeusVictim * 15 });
    if (s.suicides >= 1) cands.push({ id: "churrasqueiro", badge: "Auto-Combustao 🔥", title: "Trofeu Auto-Combustao 🔥", desc: "Suicidio gourmet: " + s.suicides + " morte(s) pra molotov/queda", score: 115 + s.suicides * 20 });
    if (s.clutchesLost >= 1) cands.push({ id: "pipoca", badge: "Pipoca de Ouro 🍿", title: "Trofeu Pipoca de Ouro 🍿", desc: "Tremeu na base: perdeu " + s.clutchesLost + " clutch(es) no 1v1", score: 100 + s.clutchesLost * 15 });
    if (s.whiffs >= 1) cands.push({ id: "ventilador", badge: "Ventilador Humano 💨", title: "Trofeu Ventilador Humano 💨", desc: "Spray no vento: " + s.whiffs + " vez(es) sem acertar 1 tiro (>15 rifle / >7 pistola)", score: 95 + s.whiffs * 12 });
    if (s.blindDeaths >= 1) cands.push({ id: "mister_magoo", badge: "Mister Magoo 🕶️", title: "Trofeu Mister Magoo 🕶️", desc: "Passeando no escuro: morreu 100% cego " + s.blindDeaths + "x", score: 85 + s.blindDeaths * 10 });
    if (s.inspectDeaths >= 1) cands.push({ id: "avaliador_skin", badge: "Avaliador de Skins 🔎", title: "Trofeu Avaliador de Skins 🔎", desc: "Morreu admirando a skin em vez de dar tiro", score: 90 });
    if (s.deathCount >= 10) cands.push({ id: "saco_pancadas", badge: "Saco de Pancadas 🥊", title: "Trofeu Saco de Pancadas 🥊", desc: "Fregues do jogo: acumulou " + s.deathCount + " mortes na partida", score: 70 + s.deathCount });
    if (parseFloat(s.kd) < 1.0) cands.push({ id: "inimigo_vitoria", badge: "Inimigo da Vitoria 🤡", title: "Trofeu Inimigo da Vitoria 🤡", desc: "K/D negativo de " + s.kd + " (" + s.killCount + "K / " + s.deathCount + "D)", score: 80 });
    cands.push({ id: "resenha", badge: "Amigo da Resenha 🥬", title: "Trofeu Amigo da Resenha 🥬", desc: "Nao jogou nada, mas garantiu a resenha no Discord", score: 10 });

    for (let c of cands) pool.push({ sid: s.sid, name: s.name, award: c, score: c.score });
  }

  pool.sort((a, b) => b.score - a.score);
  let assignedP = new Set(), assignedT = new Set(), finalAwards = [];
  for (let c of pool) {
    if (!assignedP.has(c.sid) && !assignedT.has(c.award.id)) {
      assignedP.add(c.sid);
      assignedT.add(c.award.id);
      finalAwards.push({ steamId: c.sid, playerName: c.name, trophy: c.award.title, badge: c.award.badge, desc: c.award.desc });
    }
  }
  for (let s of playerBagreStats) {
    if (!assignedP.has(s.sid)) {
      finalAwards.push({ steamId: s.sid, playerName: s.name, trophy: "Trofeu Amigo da Resenha 🥬", badge: "Amigo da Resenha 🥬", desc: "Nao jogou nada, mas garantiu a resenha no Discord" });
      assignedP.add(s.sid);
    }
  }

  return { topBagre, awards: finalAwards, bagreStats: playerBagreStats };
}