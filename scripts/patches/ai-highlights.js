function isHumanSteamIdForAi(id){let s=String(id??"");return s!==""&&s!=="0"&&s.length>5}
function aiKillPointsByCount(n){let table=[0,10,28,50,78,110,140,170,200,230,260];return n<=10?table[n]:260+(n-10)*30}
function isAutoWeaponForStreak(w){
  let name=String(w||"").toLowerCase();
  return ["ak-47","m4a4","m4a1-s","galil ar","famas","aug","sg 553","negev","m249","mp9","mac-10","mp7","mp5-sd","ump-45","p90","bizon"].some(x=>name.includes(x));
}
function detectPrecisionKillStreaks(kills,shots){
  let result=new Map();
  if(!Array.isArray(shots)||shots.length===0||!Array.isArray(kills)||kills.length===0)return result;
  let gunShots=shots.filter(s=>{
    let w=String(s.weapon_name??s.weaponName??"").toLowerCase();
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
    let pKills=kills.filter(k=>(k.round_number??k.roundNumber)===rnd&&(k.killer_steam_id??k.killerSteamId)===sid);
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
            const dt=shotsBetween[j+1].tick-shotsBetween[j].tick;
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
function isWildcardKillForAi(k){
  if(!k)return!1;
  let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
  let wt=String(k.weaponType??k.weapon_type??"").toLowerCase();
  let isKnife=wt==="knife"||w.includes("knife")||w.includes("bayonet")||w.includes("karambit")||w.includes("dagger");
  let isZeus=w.includes("taser")||w.includes("zeus");
  let isNs=Boolean(k.isNoScope??k.is_no_scope);
  let isSsgCollat=Boolean(k.isSsgCollat);
  let isPrecision=Boolean(k.isPrecisionStreak);
  return isNs||isKnife||isZeus||isSsgCollat||isPrecision;
}
function buildAiHighlightsCandidates({match,steamIds,startSecondsBeforeEvent=3,endSecondsAfterEvent=2}){
  let tr=match.tickrate>0?match.tickrate:64,before=Math.round(tr*startSecondsBeforeEvent),after=Math.round(tr*endSecondsAfterEvent),maxTick=match.tickCount>0?match.tickCount:Number.MAX_SAFE_INTEGER;
  let ssgCollatTickMap=new Map();
  for(let k of match.kills||[]){
    let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
    if((w.includes("ssg")||w.includes("scout"))&&k.killerSteamId){
      let key=`${k.roundNumber}:${k.killerSteamId}:${k.tick}`;
      ssgCollatTickMap.set(key,(ssgCollatTickMap.get(key)??0)+1);
    }
  }
  for(let k of match.kills||[]){
    let key=`${k.roundNumber}:${k.killerSteamId}:${k.tick}`;
    if((ssgCollatTickMap.get(key)??0)>=2){
      k.isSsgCollat=!0;
    }
  }
  let precisionStreaks=detectPrecisionKillStreaks(match.kills||[],match.shots||[]);
  for(let k of match.kills||[]){
    let info=precisionStreaks.get(k.id);
    if(info){
      k.isPrecisionStreak=!0;
      k.precisionStreakId=info.streakId;
      k.precisionStreakLen=info.streakLength;
      k.precisionStreakIdx=info.streakIndex;
    }
  }
  let kills=[...(match.kills||[])].sort((a,b)=>a.tick-b.tick);
  if(kills.length===0)return[];
  let allowed=Array.isArray(steamIds)&&steamIds.length>0?new Set(steamIds):null;
  let firstKillIdPerRound=new Map();
  for(let k of kills){if(!firstKillIdPerRound.has(k.roundNumber))firstKillIdPerRound.set(k.roundNumber,k.id)}
  let segIdx=new Map(),lastBot=new Map(),segKills=new Map();
  for(let k of kills){
    if(k.victimSteamId){let vk=`${k.roundNumber}:${k.victimSteamId}`;segIdx.set(vk,(segIdx.get(vk)??0)+1);lastBot.delete(vk)}
    if(!k.killerSteamId||k.killerSteamId===k.victimSteamId)continue;
    if(!isHumanSteamIdForAi(k.killerSteamId))continue;
    if(allowed&&!allowed.has(k.killerSteamId))continue;
    if(k.killerTeamName&&k.victimTeamName&&k.killerTeamName===k.victimTeamName)continue;
    let kk=`${k.roundNumber}:${k.killerSteamId}`,si=segIdx.get(kk)??0,pb=lastBot.get(kk);
    if(pb!==void 0&&pb!==k.isKillerControllingBot){si+=1;segIdx.set(kk,si)}
    lastBot.set(kk,k.isKillerControllingBot);
    let key=`${kk}:seg${si}`,l=segKills.get(key);
    l?l.push(k):segKills.set(key,[k]);
  }
  let clutches=new Map();
  for(let c of match.clutches||[]){if(c.won)clutches.set(`${c.roundNumber}:${c.clutcherSteamId}`,c)}
  let roundsMap=new Map();
  for(let r of match.rounds||[])roundsMap.set(r.number,r);
  let lastRoundNumber=(match.rounds||[]).reduce((m,r)=>Math.max(m,r.number),0);
  let gapTicks=Math.round(tr*8),candidates=[];
  for(let segList of segKills.values()){
    let clusters=[],cur=[];
    for(let k of segList){
      let maxGap=(k.precisionStreakId&&cur.length>0&&cur[cur.length-1].precisionStreakId&&k.precisionStreakId===cur[cur.length-1].precisionStreakId)?Math.round(tr*20):gapTicks;
      if(cur.length>0&&k.tick-cur[cur.length-1].tick>maxGap){clusters.push(cur);cur=[]}
      cur.push(k);
    }
    cur.length>0&&clusters.push(cur);
    for(let ks of clusters){
      let n=ks.length,first=ks[0],last=ks[n-1],span=(last.tick-first.tick)/tr,tags=[];
      let score=aiKillPointsByCount(n),rapid=0;
      if(n>=2){
        let avg=span/(n-1);
        if(avg<=1.2)rapid=22*(n-1);else if(avg<=2.5)rapid=14*(n-1);else if(avg<=4)rapid=6*(n-1);
      }
      score+=rapid;
      let hs=0,ns=0,sm=0,wb=0,air=0,bl=0,kn=0,zeus=0,ut=0,en=0,ssgCollat=0,precCount=0;
      for(let k of ks){
        let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
        let wt=String(k.weaponType??k.weapon_type??"").toLowerCase();
        let isKnife=wt==="knife"||w.includes("knife")||w.includes("bayonet")||w.includes("karambit")||w.includes("dagger");
        let isZeus=w.includes("taser")||w.includes("zeus");
        let isNs=Boolean(k.isNoScope??k.is_no_scope);
        let isSsgCollat=Boolean(k.isSsgCollat);
        let isPrecision=Boolean(k.isPrecisionStreak);
        k.isHeadshot&&hs++;
        isNs&&ns++;
        k.isThroughSmoke&&sm++;
        k.penetratedObjects>0&&wb++;
        k.isKillerAirborne&&air++;
        k.isKillerBlinded&&bl++;
        isKnife&&kn++;
        isZeus&&zeus++;
        isSsgCollat&&ssgCollat++;
        isPrecision&&precCount++;
        (wt==="grenade"||wt==="equipment")&&!isZeus&&ut++;
        firstKillIdPerRound.get(k.roundNumber)===k.id&&en++;
      }
      score+=hs*3+ns*20+sm*9+wb*9+air*12+bl*12+kn*25+zeus*25+ssgCollat*35+precCount*30+ut*12+en*5;
      let isWildcard=(ns>0||kn>0||zeus>0||ssgCollat>0||precCount>=2);
      let clutch=clutches.get(`${first.roundNumber}:${first.killerSteamId}`),clutchBonus=0;
      if(clutch&&last.tick>=clutch.tick-tr*2){clutchBonus=18*(clutch.opponentCount||1);score+=clutchBonus;tags.push(`Clutch 1v${clutch.opponentCount}`)}
      let r=roundsMap.get(first.roundNumber);
      r&&r.winnerName&&first.killerTeamName&&r.winnerName===first.killerTeamName&&(score+=6);
      first.roundNumber===lastRoundNumber&&(score+=10,tags.push("Último round"));
      let special=ns+sm+wb+air+bl+kn+zeus+ut+ssgCollat+precCount;
      if(n<2&&special===0&&clutchBonus===0&&!isWildcard)continue;
      rapid>0&&tags.unshift(n>=2&&span/(n-1)<=1.2?"Relâmpago":"Rápido");
      hs>0&&tags.push(`${hs} HS`);
      ns>0&&tags.push(ns>1?`${ns} No-Scope`:"No-Scope");
      sm>0&&tags.push("Smoke");
      wb>0&&tags.push("Wallbang");
      air>0&&tags.push("No ar");
      bl>0&&tags.push("Cego");
      kn>0&&tags.push(kn>1?`${kn} Faca`:"Faca");
      zeus>0&&tags.push(zeus>1?`${zeus} Zeus`:"Zeus");
      ssgCollat>0&&tags.push(ssgCollat>2?`${Math.floor(ssgCollat/2)+1}x Collat SSG 08`:"Collat SSG 08");
      precCount>=2&&tags.push(`${precCount}x Abates Precisos (1-2 Tiros)`);
      ut>0&&tags.push("Utilitário");
      en>0&&tags.push("Entry");
      let startTick=Math.max(1,first.tick-before),endTick=Math.min(maxTick,last.tick+after);
      if(clutchBonus>0)endTick=Math.min(maxTick,endTick+Math.round(tr));
      let player=(match.players||[]).find(p=>p.steamId===first.killerSteamId);
      candidates.push({steamId:first.killerSteamId,playerName:player?.name??first.killerName??"",roundNumber:first.roundNumber,kills:n,score:Math.round(score),startTick,endTick,seconds:(endTick-startTick)/tr,isWildcard,wildcardCount:(ns+kn+zeus+ssgCollat+precCount),description:`${n}K${tags.length>0?" • "+tags.join(", "):""}`});
    }
  }
  return candidates;
}
function buildAiHighlightsSequences({match,steamIds,maxDurationSeconds=180,includeIntro=!0,includeOutro=!0,alwaysIncludeWildcardKills=!0,settings,firstSequenceNumber=1,startSecondsBeforeEvent=3,endSecondsAfterEvent=2}){
  let tr=match.tickrate>0?match.tickrate:64;
  let candidates=buildAiHighlightsCandidates({match,steamIds,startSecondsBeforeEvent,endSecondsAfterEvent});
  let introExtra=includeIntro?8:0,outroExtra=includeOutro?5:0;
  let budget=Math.max(10,maxDurationSeconds-introExtra-outroExtra),used=0,chosen=[],perPlayer=new Map(),remaining=[...candidates];
  let wildcardPlaysCount=0;
  let minGapTicks=Math.round(tr*4);

  if(alwaysIncludeWildcardKills){
    let wildcards=remaining.filter(c=>c.isWildcard).sort((a,b)=>b.score-a.score);
    for(let wc of wildcards){
      // Check if already in chosen
      let existing=chosen.find(s=>s.roundNumber===wc.roundNumber&&wc.startTick<=s.endTick+minGapTicks&&wc.endTick>=s.startTick-minGapTicks);
      if(!existing){
        chosen.push(wc);
        wildcardPlaysCount++;
        perPlayer.set(wc.steamId,(perPlayer.get(wc.steamId)??0)+1);
      }
    }
    remaining=remaining.filter(c=>!chosen.some(s=>s.roundNumber===c.roundNumber&&c.startTick<=s.endTick+minGapTicks&&c.endTick>=s.startTick-minGapTicks));
  }
  while(remaining.length>0){
    let bestIdx=-1,bestVal=-1;
    for(let i=0;i<remaining.length;i++){
      let c=remaining[i];
      if(used+c.seconds>budget)continue;
      if(chosen.some(s=>s.roundNumber===c.roundNumber&&c.startTick<=s.endTick+minGapTicks&&c.endTick>=s.startTick-minGapTicks))continue;
      let val=c.score*Math.pow(0.82,perPlayer.get(c.steamId)??0);
      if(val>bestVal){bestVal=val;bestIdx=i}
    }
    if(bestIdx===-1)break;
    let pick=remaining.splice(bestIdx,1)[0];
    chosen.push(pick);used+=pick.seconds;perPlayer.set(pick.steamId,(perPlayer.get(pick.steamId)??0)+1);
  }

  // Merge adjacent or overlapping plays in the SAME round into continuous multi-camera sequences
  chosen.sort((a,b)=>a.startTick-b.startTick);
  let mergedPlays=[];
  for(let c of chosen){
    if(mergedPlays.length===0){
      mergedPlays.push({
        ...c,
        playerCameras:[{tick:c.startTick,playerSteamId:c.steamId,playerName:c.playerName,roundNumber:c.roundNumber}]
      });
    }else{
      let prev=mergedPlays[mergedPlays.length-1];
      if(c.roundNumber===prev.roundNumber&&c.startTick<=prev.endTick+minGapTicks){
        prev.endTick=Math.max(prev.endTick,c.endTick);
        prev.seconds=(prev.endTick-prev.startTick)/tr;
        prev.kills+=c.kills;
        prev.score+=c.score;
        if(c.isWildcard)prev.isWildcard=!0;
        let lastCam=prev.playerCameras[prev.playerCameras.length-1];
        if(lastCam.playerSteamId!==c.steamId){
          prev.playerCameras.push({
            tick:Math.max(prev.startTick+16,c.startTick),
            playerSteamId:c.steamId,
            playerName:c.playerName,
            roundNumber:c.roundNumber
          });
          prev.description+=` ➔ ${c.playerName} (${c.description})`;
        }else{
          prev.description+=` + ${c.description}`;
        }
      }else{
        mergedPlays.push({
          ...c,
          playerCameras:[{tick:c.startTick,playerSteamId:c.steamId,playerName:c.playerName,roundNumber:c.roundNumber}]
        });
      }
    }
  }

  let totalChosenSeconds=mergedPlays.reduce((acc,c)=>acc+c.seconds,0);
  let sequences=mergedPlays.map((c,i)=>({
    number:firstSequenceNumber+i,
    startTick:c.startTick,
    endTick:c.endTick,
    roundNumber:c.roundNumber,
    showOnlyDeathNotices:settings.showOnlyDeathNotices,
    deathNoticesDuration:settings.deathNoticesDuration,
    showXRay:settings.showXRay,
    showAssists:settings.showAssists,
    recordAudio:settings.recordAudio,
    playerVoicesEnabled:settings.playerVoicesEnabled,
    playersOptions:buildPlayersOptions(match.players,c.playerCameras.map(cam=>cam.playerSteamId).filter(Boolean)),
    playerCameras:c.playerCameras,
    cameras:[]
  }));
  return{sequences,plays:mergedPlays,totalSeconds:totalChosenSeconds+(mergedPlays.length>0?introExtra+outroExtra:0),candidatesCount:candidates.length,wildcardPlaysCount};
}
function GenerateAiHighlightsDialog(){
  let dispatch=Mu(),match=useCurrentMatch$2(),{settings,updateSettings}=useVideoSettings(),{hideDialog,showDialog}=useDialog(),client=useWebSocketClient(),navigate=useNavigate();
  let allSteamIds=(0,W.useMemo)(()=>match.players.map(p=>p.steamId),[match.players]);
  let teamASteamIds=(0,W.useMemo)(()=>match.players.filter(p=>p.teamName===match.teamA.name).map(p=>p.steamId),[match.players,match.teamA.name]);
  let teamBSteamIds=(0,W.useMemo)(()=>match.players.filter(p=>p.teamName===match.teamB.name).map(p=>p.steamId),[match.players,match.teamB.name]);
  let[selectedSteamIds,setSelectedSteamIds]=(0,W.useState)(allSteamIds);
  let[maxDurationSeconds,setMaxDurationSeconds]=(0,W.useState)(180);
  let[alwaysIncludeWildcardKills,setAlwaysIncludeWildcardKills]=(0,W.useState)(!0);
  let[hudPosition,setHudPosition]=(0,W.useState)(settings.hudPosition??"top-left");
  let[showIntroScreen,setShowIntroScreen]=(0,W.useState)(settings.showIntroScreen??!0);
  let[showOutroScreen,setShowOutroScreen]=(0,W.useState)(settings.showOutroScreen??!0);
  let[showFunAwards,setShowFunAwards]=(0,W.useState)(settings.showFunAwards??!0);
  let[enableKillCounter,setEnableKillCounter]=(0,W.useState)(settings.enableKillCounter??!0);
  let[enableSlowMotion,setEnableSlowMotion]=(0,W.useState)(settings.enableSlowMotion??!0);
  let[enableSequenceTransitions,setEnableSequenceTransitions]=(0,W.useState)(settings.enableSequenceTransitions??!0);
  let[hideGameWindow,setHideGameWindow]=(0,W.useState)(settings.hideGameWindow??!0);
  let[isStartingRecording,setIsStartingRecording]=(0,W.useState)(!1);
  let durationOptions=[{value:60,label:"Até 1 minuto"},{value:90,label:"Até 1 min 30 s"},{value:120,label:"Até 2 minutos"},{value:180,label:"Até 3 minutos (Recomendado)"}];
  let hudPositionOptions=[{value:"top-left",label:"Canto Superior Esquerdo (Recomendado)"},{value:"bottom-left",label:"Canto Inferior Esquerdo"},{value:"bottom-right",label:"Canto Inferior Direito"},{value:"top-center",label:"Topo Centralizado"},{value:"top-right",label:"Canto Superior Direito"},{value:"none",label:"Desativado (Sem nome na tela)"}];
  let result=(0,W.useMemo)(()=>buildAiHighlightsSequences({match,steamIds:selectedSteamIds,maxDurationSeconds,includeIntro:showIntroScreen,includeOutro:showOutroScreen,alwaysIncludeWildcardKills,settings,firstSequenceNumber:1}),[match,selectedSteamIds,maxDurationSeconds,showIntroScreen,showOutroScreen,alwaysIncludeWildcardKills,settings]);
  let formatDur=sec=>{let r=Math.max(0,Math.round(sec)),m=Math.floor(r/60),s=r%60;return`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`};
  let applyTimelineOnly=()=>{
    if(result.sequences.length===0)return;
    dispatch(Fs({demoFilePath:match.demoFilePath,sequences:result.sequences}));
    hideDialog();
  };
  let recordNow=async()=>{
    if(result.sequences.length===0||isStartingRecording)return;
    setIsStartingRecording(!0);
    await updateSettings({hideGameWindow,hudPosition,showIntroScreen,showOutroScreen,showFunAwards,enableKillCounter,enableSlowMotion,enableSequenceTransitions});
    dispatch(Fs({demoFilePath:match.demoFilePath,sequences:result.sequences}));
    try{
      let payload={...settings,concatenateSequences:!0,hideGameWindow,hudPosition,showIntroScreen,showOutroScreen,showFunAwards,enableKillCounter,enableSlowMotion,enableSequenceTransitions,checksum:match.checksum,game:match.game,tickrate:match.tickrate,demoPath:match.demoFilePath,mapName:match.mapName,sequences:result.sequences};
      await client.send({name:Lg.AddVideoToQueue,payload});
      await client.send({name:Lg.ResumeVideoQueue});
      hideDialog();
      await navigate(Nu.Videos);
    }catch(err){
      setIsStartingRecording(!1);
      let msg=getPlaybackErrorMessageFromErrorCode(isErrorCode(err)?err:Sl.UnknownError,match.game);
      showDialog((0,Q.jsx)(AddVideoToQueueErrorDialog,{children:msg}));
    }
  };
  return(0,Q.jsxs)(Dialog$1,{onEnterPressed:applyTimelineOnly,children:[
    (0,Q.jsx)(DialogHeader,{children:(0,Q.jsx)(DialogTitle,{children:"Highlights Automáticos (IA escolhe os melhores lances)"})}),
    (0,Q.jsx)(DialogContent,{children:(0,Q.jsxs)("div",{className:"flex w-[680px] max-h-[78vh] overflow-y-auto flex-col gap-y-12 pr-4",children:[
      (0,Q.jsx)("p",{className:"text-caption",children:"A seleção analisa todos os abates da partida e dá uma nota para cada lance: quantidade de abates no mesmo boneco, velocidade da sequência, clutches, abates coringas (no-scope, faca, zeus, collat ssg 08 e 1-2 tiros seguidos), headshots, wallbang, smoke, entry e rounds decisivos. Os lances coringas são garantidos no vídeo mesmo se ultrapassarem o tempo máximo."}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8",children:[
        (0,Q.jsxs)("div",{className:"flex items-center gap-x-8",children:[
          (0,Q.jsx)("span",{className:"text-body-strong",children:"Jogadores considerados:"}),
          (0,Q.jsxs)(Button$1,{onClick:()=>setSelectedSteamIds(allSteamIds),children:["Todos (",allSteamIds.length,")"]}),
          (0,Q.jsx)(Button$1,{onClick:()=>setSelectedSteamIds(teamASteamIds),children:match.teamA.name}),
          (0,Q.jsx)(Button$1,{onClick:()=>setSelectedSteamIds(teamBSteamIds),children:match.teamB.name})
        ]}),
        (0,Q.jsx)(PlayersSelect,{players:match.players,selectedSteamIds,onChange:setSelectedSteamIds})
      ]}),
      (0,Q.jsxs)("div",{className:"grid grid-cols-2 gap-12 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)(Select$1,{label:"Duração máxima do vídeo (incluindo intro e outro)",options:durationOptions,value:maxDurationSeconds,onChange:setMaxDurationSeconds}),
        (0,Q.jsx)(Select$1,{label:"Posição do nome (POV: Jogador - Round X)",options:hudPositionOptions,value:hudPosition,onChange:setHudPosition})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)(Checkbox,{label:"Sempre incluir abates coringas (No-Scope, Faca, Zeus, Collat SSG 08 e 1-2 Tiros Seguidos - isentos do limite de tempo)",isChecked:alwaysIncludeWildcardKills,onChange:e=>setAlwaysIncludeWildcardKills(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Contador de kills animado no HUD (1K, Double, Triple, Ace, Clutches e Armas)",isChecked:enableKillCounter,onChange:e=>setEnableKillCounter(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Câmera lenta (Slow Motion 0.5x) em abates épicos (No-Scope, Faca, Wallbang e Clutches)",isChecked:enableSlowMotion,onChange:e=>setEnableSlowMotion(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Tela de introdução de 8s (Mapa, Placar Final e KDA dos jogadores)",isChecked:showIntroScreen,onChange:e=>setShowIntroScreen(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Tela de encerramento no final do vídeo (MVP e Destaques)",isChecked:showOutroScreen,onChange:e=>setShowOutroScreen(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Troféus Engraçados da Partida (Destaque cômico para todos os jogadores: Porta da Esperança, Cearense Lover, Bob Marley, Pikachu, etc.)",isChecked:showFunAwards,onChange:e=>setShowFunAwards(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Transição suave (Fade) entre os lances",isChecked:enableSequenceTransitions,onChange:e=>setEnableSequenceTransitions(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Gravar com o CS oculto em 2º plano",isChecked:hideGameWindow,onChange:e=>setHideGameWindow(e.target.checked)})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-4 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsxs)("span",{className:"text-body-strong",children:["Lances escolhidos (",result.plays.length," de ",result.candidatesCount," candidatos):"]}),
        result.plays.length===0?(0,Q.jsx)("span",{className:"text-caption",children:"Nenhum lance encontrado para os jogadores selecionados."}):(0,Q.jsx)("div",{className:"flex flex-col gap-y-2 max-h-[260px] overflow-y-auto",children:result.plays.map((p,i)=>(0,Q.jsxs)("div",{className:"flex justify-between gap-x-8 text-caption border-b border-gray-300 py-2",children:[
          (0,Q.jsx)("span",{children:`${String(i+1).padStart(2,"0")}. Round ${p.roundNumber} • ${p.playerName} • ${p.description}${p.isWildcard?" 🃏 [Coringa]":""}`}),
          (0,Q.jsx)("span",{className:"whitespace-nowrap",children:`${Math.round(p.seconds)}s • nota ${p.score}`})
        ]},`${p.steamId}-${p.startTick}`))})
      ]}),
      (0,Q.jsx)("div",{className:"rounded-4 bg-gray-200 p-12",children:(0,Q.jsxs)("span",{className:"text-body-strong",children:["Duração total estimada: ",formatDur(result.totalSeconds)," de ",formatDur(maxDurationSeconds),result.wildcardPlaysCount>0?` (inclui ${result.wildcardPlaysCount} lance(s) coringa(s) isento(s))`:"" ]})})
    ]})}),
    (0,Q.jsxs)(DialogFooter,{children:[
      (0,Q.jsxs)(Button$1,{variant:zg.Primary,onClick:recordNow,isDisabled:result.sequences.length===0||isStartingRecording,children:["Gerar e Gravar Agora (",result.sequences.length,")"]}),
      (0,Q.jsx)(Button$1,{onClick:applyTimelineOnly,isDisabled:result.sequences.length===0||isStartingRecording,children:"Apenas Montar Timeline"}),
      (0,Q.jsx)(CancelButton,{onClick:hideDialog})
    ]})
  ]});
}
function GenerateAiHighlightsButton(){
  let{showDialog}=useDialog();
  return(0,Q.jsx)(Button$1,{variant:zg.Primary,onClick:()=>{showDialog((0,Q.jsx)(GenerateAiHighlightsDialog,{}))},children:"Highlights Automáticos (IA, até 3 min)"});
}
