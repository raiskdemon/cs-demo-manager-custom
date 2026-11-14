function isUtilityOrKnifeKill(kill){
  return kill.weaponType==="knife"||kill.weaponType==="grenade"||kill.weaponType==="equipment";
}
function isWildcardKill(kill){
  if(!kill)return!1;
  let w=String(kill.weaponName??kill.weapon_name??"").toLowerCase();
  let wt=String(kill.weaponType??kill.weapon_type??"").toLowerCase();
  let isKnife=wt==="knife"||w.includes("knife")||w.includes("bayonet")||w.includes("karambit")||w.includes("dagger");
  let isZeus=w.includes("taser")||w.includes("zeus");
  let isNs=Boolean(kill.isNoScope??kill.is_no_scope);
  let isSsgCollat=Boolean(kill.isSsgCollat);
  let isPrecision=Boolean(kill.isPrecisionStreak||kill.isOneShotStreak);
  return isNs||isKnife||isZeus||isSsgCollat||isPrecision;
}
function buildMatchHighlightsSequences({match,steamIds,rounds,weapons,perspective,minKillsInRound,lifeMode,includeClutches,minClutchOpponents,guaranteeAllPlayers,minSequencesPerPlayer,adaptiveThresholdForLowFraggers,specialFilters,startSecondsBeforeEvent,endSecondsAfterEvent,maxSecondsBetweenEvents,settings,firstSequenceNumber,rapidKillsEnabled=!1,rapidMinKills=3,rapidWindowSeconds=5,alwaysIncludeWildcardKills=!0,maxVideoMinutes=0}){
  if(steamIds.length===0||!match.kills||match.kills.length===0)return[];
  let allKills=match.kills.map(k=>({...k}));
  let ssgCollatTickMap=new Map();
  for(let k of allKills){
    let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
    if((w.includes("ssg")||w.includes("scout"))&&k.killerSteamId){
      let key=`${k.roundNumber}:${k.killerSteamId}:${k.tick}`;
      ssgCollatTickMap.set(key,(ssgCollatTickMap.get(key)??0)+1);
    }
  }
  for(let k of allKills){
    let key=`${k.roundNumber}:${k.killerSteamId}:${k.tick}`;
    if((ssgCollatTickMap.get(key)??0)>=2){
      k.isSsgCollat=!0;
    }
  }
  let precStreaks=(typeof detectPrecisionKillStreaks==="function"?detectPrecisionKillStreaks(allKills,match.shots||[]):new Map());
  for(let k of allKills){
    let info=precStreaks.get(k.id);
    if(info){
      k.isPrecisionStreak=!0;
      k.precisionStreakId=info.streakId;
      k.precisionStreakLen=info.streakLength;
      k.precisionStreakIdx=info.streakIndex;
      k.isOneShotStreak=!0;
      k.oneShotStreakLen=info.streakLength;
      k.oneShotStreakIdx=info.streakIndex;
    }
  }
  let firstKillIdPerRound=new Map(),bombActionPlayersPerRound=new Set();
  if(Array.isArray(match.bombsPlanted)){
    for(let p of match.bombsPlanted)bombActionPlayersPerRound.add(`${p.roundNumber}:${p.planterSteamId}`);
  }
  if(Array.isArray(match.bombsDefused)){
    for(let d of match.bombsDefused)bombActionPlayersPerRound.add(`${d.roundNumber}:${d.defuserSteamId}`);
  }
  let currentSegmentIndex=new Map(),lastBotControlState=new Map(),killSegmentKeyById=new Map(),killsPerSegment=new Map(),totalMatchKillsPerPlayer=new Map();
  for(let kill of allKills){
    if(!firstKillIdPerRound.has(kill.roundNumber))firstKillIdPerRound.set(kill.roundNumber,kill.id);
    if(kill.victimSteamId){
      let vKey=`${kill.roundNumber}:${kill.victimSteamId}`;
      currentSegmentIndex.set(vKey,(currentSegmentIndex.get(vKey)??0)+1);
      lastBotControlState.delete(vKey);
    }
    if(!kill.killerSteamId||kill.killerSteamId===kill.victimSteamId)continue;
    if(lifeMode==="human_only"&&kill.isKillerControllingBot&&!(alwaysIncludeWildcardKills&&isWildcardKill(kill)))continue;
    if(lifeMode==="bot_only"&&!kill.isKillerControllingBot&&!(alwaysIncludeWildcardKills&&isWildcardKill(kill)))continue;
    totalMatchKillsPerPlayer.set(kill.killerSteamId,(totalMatchKillsPerPlayer.get(kill.killerSteamId)??0)+1);
    let kKey=`${kill.roundNumber}:${kill.killerSteamId}`,segIdx=currentSegmentIndex.get(kKey)??0;
    if(lifeMode!=="whole_round"){
      let prevBot=lastBotControlState.get(kKey);
      if(prevBot!==void 0&&prevBot!==kill.isKillerControllingBot){
        segIdx+=1;
        currentSegmentIndex.set(kKey,segIdx);
      }
      lastBotControlState.set(kKey,kill.isKillerControllingBot);
    }
    let segKey=lifeMode==="whole_round"?kKey:`${kKey}:seg${segIdx}`;
    killSegmentKeyById.set(kill.id,segKey);
    let segKills=killsPerSegment.get(segKey);
    if(segKills===void 0){
      segKills=[];
      killsPerSegment.set(segKey,segKills);
    }
    segKills.push(kill);
  }
  let sortedKillsPerPlayer=[...totalMatchKillsPerPlayer.entries()].sort((a,b)=>a[1]-b[1]);
  let lowFraggerSteamIds=new Set();
  if(adaptiveThresholdForLowFraggers&&sortedKillsPerPlayer.length>1){
    let half=Math.ceil(sortedKillsPerPlayer.length/2);
    for(let i=0;i<half;i++)lowFraggerSteamIds.add(sortedKillsPerPlayer[i][0]);
  }
  let roundsSelected=Array.isArray(rounds)&&rounds.length>0;
  let weaponsSelected=Array.isArray(weapons)&&weapons.length>0;
  let kills=allKills.filter(kill=>{
    if(!kill.killerSteamId||!steamIds.includes(kill.killerSteamId))return!1;
    if(roundsSelected&&!rounds.includes(kill.roundNumber))return!1;
    let wildcard=alwaysIncludeWildcardKills&&isWildcardKill(kill);
    if(wildcard)return!0;
    if(weaponsSelected&&!weapons.includes(kill.weaponName))return!1;
    if(lifeMode==="human_only"&&kill.isKillerControllingBot)return!1;
    if(lifeMode==="bot_only"&&!kill.isKillerControllingBot)return!1;
    let segKey=killSegmentKeyById.get(kill.id);
    let totalSegmentKills=segKey?killsPerSegment.get(segKey)?.length??1:1;
    let effectiveMinKills=lowFraggerSteamIds.has(kill.killerSteamId)?Math.max(1,Math.min(minKillsInRound,Math.max(2,minKillsInRound-1))):minKillsInRound;
    let meetsKillThreshold=totalSegmentKills>=effectiveMinKills;
    let isSpecialKill=!1;
    if(specialFilters){
      let matchesAnySpecial=Boolean(
        (specialFilters.onlyHeadshot&&kill.isHeadshot)||
        (specialFilters.onlyNoScope&&kill.isNoScope)||
        (specialFilters.onlyThroughSmoke&&kill.isThroughSmoke)||
        (specialFilters.onlyWallbang&&kill.penetratedObjects>0)||
        (specialFilters.onlyAirborne&&kill.isKillerAirborne)||
        (specialFilters.onlyBlind&&kill.isKillerBlinded)||
        (specialFilters.onlyEntryKill&&firstKillIdPerRound.get(kill.roundNumber)===kill.id)||
        (specialFilters.onlyUtilityOrKnife&&isUtilityOrKnifeKill(kill))||
        (specialFilters.onlyTradeKill&&kill.isTradeKill)||
        (specialFilters.onlyBombAction&&bombActionPlayersPerRound.has(`${kill.roundNumber}:${kill.killerSteamId}`))
      );
      if(specialFilters.mode==="restrict"){
        if(!matchesAnySpecial)return!1;
      }else if(specialFilters.mode==="bonus"){
        isSpecialKill=matchesAnySpecial;
      }
    }
    let isRapidKill=!1;
    if(rapidKillsEnabled&&segKey){
      let list=killsPerSegment.get(segKey)||[];
      let winTicks=Math.round((match.tickrate>0?match.tickrate:64)*rapidWindowSeconds);
      for(let i=0;i<=list.length-rapidMinKills;i++){
        let first=list[i],last=list[i+rapidMinKills-1];
        if(last.tick-first.tick<=winTicks&&kill.tick>=first.tick&&kill.tick<=last.tick){
          isRapidKill=!0;
          break;
        }
      }
    }
    return meetsKillThreshold||isSpecialKill||isRapidKill;
  });
  let wonClutches=includeClutches?match.clutches.filter(c=>c.won&&c.opponentCount>=minClutchOpponents&&steamIds.includes(c.clutcherSteamId)&&(!roundsSelected||rounds.includes(c.roundNumber))):[];
  let allEvents=[];
  for(let kill of kills)allEvents.push({type:"kill",tick:kill.tick,roundNumber:kill.roundNumber,playerSteamId:perspective===Vs.Enemy?kill.victimSteamId:kill.killerSteamId,kill,isWildcard:Boolean(alwaysIncludeWildcardKills&&isWildcardKill(kill))});
  for(let clutch of wonClutches)allEvents.push({type:"clutch",tick:clutch.tick,roundNumber:clutch.roundNumber,playerSteamId:clutch.clutcherSteamId,clutch,isWildcard:!1});
  allEvents.sort((a,b)=>a.tick-b.tick);
  let tickrate=match.tickrate>0?match.tickrate:64;
  let ticksBefore=Math.round(tickrate*startSecondsBeforeEvent);
  let ticksAfter=Math.round(tickrate*endSecondsAfterEvent);
  let minGapTicks=Math.round(tickrate*4);
  let maxTicksBetween=Math.max(Math.round(tickrate*maxSecondsBetweenEvents),minGapTicks);
  let maxTick=match.tickCount>0?match.tickCount:Number.MAX_SAFE_INTEGER;
  let rawSequences=[],currentSeq=null;
  for(let ev of allEvents){
    let evStart=Math.max(1,ev.tick-ticksBefore),evEnd=Math.min(maxTick,ev.tick+ticksAfter);
    let isSamePrecStreak=Boolean(ev.kill?.precisionStreakId&&currentSeq?.precisionStreakId&&currentSeq.precisionStreakId===ev.kill.precisionStreakId);
    let effectiveMaxTicks=isSamePrecStreak?Math.round(tickrate*20):maxTicksBetween;
    if(currentSeq===null){
      currentSeq={startTick:evStart,endTick:evEnd,roundNumber:ev.roundNumber,playerCameras:[{tick:evStart,playerSteamId:ev.playerSteamId}],primaryPlayerSteamId:ev.playerSteamId,eventCount:1,isWildcard:Boolean(ev.isWildcard),precisionStreakId:ev.kill?.precisionStreakId};
    }else if(currentSeq.roundNumber===ev.roundNumber&&evStart<=currentSeq.endTick+effectiveMaxTicks){
      currentSeq.endTick=Math.max(currentSeq.endTick,evEnd);
      currentSeq.eventCount+=1;
      if(ev.isWildcard)currentSeq.isWildcard=!0;
      if(ev.kill?.precisionStreakId)currentSeq.precisionStreakId=ev.kill.precisionStreakId;
      let lastCam=currentSeq.playerCameras[currentSeq.playerCameras.length-1];
      if(lastCam.playerSteamId!==ev.playerSteamId)currentSeq.playerCameras.push({tick:Math.max(currentSeq.startTick+16,evStart),playerSteamId:ev.playerSteamId});
    }else{
      rawSequences.push(currentSeq);
      currentSeq={startTick:evStart,endTick:evEnd,roundNumber:ev.roundNumber,playerCameras:[{tick:evStart,playerSteamId:ev.playerSteamId}],primaryPlayerSteamId:ev.playerSteamId,eventCount:1,isWildcard:Boolean(ev.isWildcard),precisionStreakId:ev.kill?.precisionStreakId};
    }
  }
  if(currentSeq!==null)rawSequences.push(currentSeq);
  if(guaranteeAllPlayers){
    for(let sid of steamIds){
      let count=rawSequences.filter(s=>s.primaryPlayerSteamId===sid||s.playerCameras.some(c=>c.playerSteamId===sid)).length;
      if(count<minSequencesPerPlayer){
        let needed=minSequencesPerPlayer-count;
        let pKills=allKills.filter(k=>k.killerSteamId===sid&&(!roundsSelected||rounds.includes(k.roundNumber))).sort((a,b)=>b.tick-a.tick);
        for(let pk of pKills){
          if(needed<=0)break;
          let kStart=Math.max(1,pk.tick-ticksBefore),kEnd=Math.min(maxTick,pk.tick+ticksAfter);
          let overlaps=rawSequences.some(s=>s.roundNumber===pk.roundNumber&&kStart<=s.endTick+minGapTicks&&kEnd>=s.startTick-minGapTicks);
          if(!overlaps){
            rawSequences.push({startTick:kStart,endTick:kEnd,roundNumber:pk.roundNumber,playerCameras:[{tick:kStart,playerSteamId:sid}],primaryPlayerSteamId:sid,eventCount:1,isWildcard:Boolean(alwaysIncludeWildcardKills&&isWildcardKill(pk))});
            needed--;
          }
        }
      }
    }
  }
  rawSequences.sort((a,b)=>a.startTick-b.startTick);
  let mergedRaw=[];
  for(let s of rawSequences){
    if(mergedRaw.length===0){
      mergedRaw.push(s);
    }else{
      let prev=mergedRaw[mergedRaw.length-1];
      if(s.roundNumber===prev.roundNumber&&s.startTick<=prev.endTick+minGapTicks){
        prev.endTick=Math.max(prev.endTick,s.endTick);
        prev.eventCount+=s.eventCount;
        if(s.isWildcard)prev.isWildcard=!0;
        for(let cam of s.playerCameras){
          let lastCam=prev.playerCameras[prev.playerCameras.length-1];
          if(lastCam.playerSteamId!==cam.playerSteamId){
            prev.playerCameras.push({tick:Math.max(prev.startTick+16,cam.tick),playerSteamId:cam.playerSteamId});
          }
        }
      }else{
        mergedRaw.push(s);
      }
    }
  }
  for(let seq of mergedRaw){
    let sKills=allKills.filter(k=>k.tick>=seq.startTick&&k.tick<=seq.endTick).sort((a,b)=>a.tick-b.tick);
    let ffIntervals=[];
    for(let i=0;i<sKills.length-1;i++){
      let k1=sKills[i],k2=sKills[i+1];
      let w1=String(k1.weaponName??k1.weapon_name??"").toLowerCase();
      let w2=String(k2.weaponName??k2.weapon_name??"").toLowerCase();
      if(isExcludedWeaponForStreak(w1)||isExcludedWeaponForStreak(w2))continue;
      let gapSec=(k2.tick-k1.tick)/tickrate;
      if(gapSec>5){
        let ffSt=k1.tick+Math.round(tickrate*1.0);
        let ffEn=k2.tick-Math.round(tickrate*2.0);
        if(ffEn>ffSt+Math.round(tickrate*1.0)){
          ffIntervals.push({startTick:ffSt,endTick:ffEn,speed:2.0});
        }
      }
    }
    seq.fastForwardIntervals=ffIntervals;
  }
  return mergedRaw.map((seq,index)=>({
    number:firstSequenceNumber+index,
    startTick:seq.startTick,
    endTick:seq.endTick,
    roundNumber:seq.roundNumber,
    showOnlyDeathNotices:settings.showOnlyDeathNotices,
    deathNoticesDuration:settings.deathNoticesDuration,
    showXRay:settings.showXRay,
    showAssists:settings.showAssists,
    recordAudio:settings.recordAudio,
    playerVoicesEnabled:settings.playerVoicesEnabled,
    playersOptions:buildPlayersOptions(match.players,seq.playerCameras.map(c=>c.playerSteamId).filter(Boolean)),
    playerCameras:seq.playerCameras,
    fastForwardIntervals:seq.fastForwardIntervals||[],
    cameras:[]
  }));
}
function GenerateMatchHighlightsDialog(){
  let dispatch=Mu(),match=useCurrentMatch$2(),existingSequences=useCurrentMatchSequences(),{settings,updateSettings}=useVideoSettings(),{hideDialog,showDialog}=useDialog(),client=useWebSocketClient(),navigate=useNavigate();
  let allSteamIds=(0,W.useMemo)(()=>match.players.map(p=>p.steamId),[match.players]);
  let teamASteamIds=(0,W.useMemo)(()=>match.players.filter(p=>p.teamName===match.teamA.name).map(p=>p.steamId),[match.players,match.teamA.name]);
  let teamBSteamIds=(0,W.useMemo)(()=>match.players.filter(p=>p.teamName===match.teamB.name).map(p=>p.steamId),[match.players,match.teamB.name]);
  let[selectedSteamIds,setSelectedSteamIds]=(0,W.useState)(allSteamIds);
  let[selectedRounds,setSelectedRounds]=(0,W.useState)([]);
  let visibleWeapons=(0,W.useMemo)(()=>selectedSteamIds.length===0?[]:uniqueArray(match.kills.filter(k=>selectedSteamIds.includes(k.killerSteamId)).map(k=>k.weaponName)),[selectedSteamIds,match]);
  let[selectedWeapons,setSelectedWeapons]=(0,W.useState)(visibleWeapons);
  let[perspective,setPerspective]=(0,W.useState)(Vs.Player);
  let[minKillsInRound,setMinKillsInRound]=(0,W.useState)(3);
  let[lifeMode,setLifeMode]=(0,W.useState)("same_body");
  let[includeClutches,setIncludeClutches]=(0,W.useState)(!0);
  let[minClutchOpponents,setMinClutchOpponents]=(0,W.useState)(2);
  let[rapidKillsEnabled,setRapidKillsEnabled]=(0,W.useState)(!0);
  let[rapidMinKills,setRapidMinKills]=(0,W.useState)(3);
  let[rapidWindowSeconds,setRapidWindowSeconds]=(0,W.useState)(5);
  let[alwaysIncludeWildcardKills,setAlwaysIncludeWildcardKills]=(0,W.useState)(!0);
  let[guaranteeAllPlayers,setGuaranteeAllPlayers]=(0,W.useState)(!1);
  let[minSequencesPerPlayer,setMinSequencesPerPlayer]=(0,W.useState)(1);
  let[adaptiveThresholdForLowFraggers,setAdaptiveThresholdForLowFraggers]=(0,W.useState)(!1);
  let[hideGameWindow,setHideGameWindow]=(0,W.useState)(settings.hideGameWindow??!0);
  let[hudPosition,setHudPosition]=(0,W.useState)(settings.hudPosition??"top-left");
  let[showIntroScreen,setShowIntroScreen]=(0,W.useState)(settings.showIntroScreen??!0);
  let[showOutroScreen,setShowOutroScreen]=(0,W.useState)(settings.showOutroScreen??!0);
  let[showFunAwards,setShowFunAwards]=(0,W.useState)(settings.showFunAwards??!0);
  let[enableKillCounter,setEnableKillCounter]=(0,W.useState)(settings.enableKillCounter??!0);
  let[enableSlowMotion,setEnableSlowMotion]=(0,W.useState)(settings.enableSlowMotion??!0);
  let[enableFastForward,setEnableFastForward]=(0,W.useState)(settings.enableFastForward??!0);
  let[enableSequenceTransitions,setEnableSequenceTransitions]=(0,W.useState)(settings.enableSequenceTransitions??!0);
  let[specialFilters,setSpecialFilters]=(0,W.useState)({onlyHeadshot:!1,onlyNoScope:!1,onlyThroughSmoke:!1,onlyWallbang:!1,onlyAirborne:!1,onlyBlind:!1,onlyEntryKill:!1,onlyUtilityOrKnife:!1,onlyTradeKill:!1,onlyBombAction:!1,mode:"bonus"});
  let[startSecondsBeforeEvent,setStartSecondsBeforeEvent]=(0,W.useState)(3);
  let[endSecondsAfterEvent,setEndSecondsAfterEvent]=(0,W.useState)(2);
  let[maxSecondsBetweenEvents,setMaxSecondsBetweenEvents]=(0,W.useState)(10);
  let[preserveExistingSequences,setPreserveExistingSequences]=(0,W.useState)(!1);
  let[isStartingRecording,setIsStartingRecording]=(0,W.useState)(!1);
  let minKillsOptions=[{value:1,label:"1K+ (Todos os abates selecionados)"},{value:2,label:"2K+ (Double Kill ou mais)"},{value:3,label:"3K+ (Triple Kill ou mais - Recomendado)"},{value:4,label:"4K+ (Quadra Kill ou mais)"},{value:5,label:"5K+ (5 abates ou mais)"},{value:6,label:"6K+ (6 abates ou mais - 10x10)"},{value:7,label:"7K+ (7 abates ou mais - 10x10)"},{value:8,label:"8K+ (8 abates ou mais - 10x10)"},{value:9,label:"9K+ (9 abates ou mais - 10x10)"},{value:10,label:"10K (10 abates no round - 10x10)"}];
  let lifeModeOptions=[{value:"same_body",label:"No mesmo boneco (Próprio OU Bot assumido, sem morrer no meio) [Recomendado]"},{value:"human_only",label:"Apenas no próprio boneco (Ignorar kills controlando Bot)"},{value:"bot_only",label:"Apenas controlando Bot (Somente lances jogando no Bot)"},{value:"whole_round",label:"Somar round inteiro (Permitir morrer e continuar matando no Bot)"}];
  let minClutchOptions=[{value:1,label:"1v1 ou maior"},{value:2,label:"1v2 ou maior (Recomendado)"},{value:3,label:"1v3 ou maior"},{value:4,label:"1v4 ou maior"},{value:5,label:"1v5 ou maior"},{value:6,label:"1v6 ou maior (10x10)"},{value:7,label:"1v7 ou maior (10x10)"},{value:8,label:"1v8 ou maior (10x10)"}];
  let minSequencesPerPlayerOptions=[{value:1,label:"Pelo menos 1 melhor lance de cada jogador"},{value:2,label:"Pelo menos 2 melhores lances de cada jogador"},{value:3,label:"Pelo menos 3 melhores lances de cada jogador"}];
  let specialModeOptions=[{value:"bonus",label:"Incluir também abates com estes atributos (Bônus)"},{value:"restrict",label:"Exigir obrigatoriamente os atributos marcados (Restrito)"}];
  let hudPositionOptions=[{value:"top-left",label:"Canto Superior Esquerdo (Recomendado - livre do Killfeed)"},{value:"bottom-left",label:"Canto Inferior Esquerdo"},{value:"bottom-right",label:"Canto Inferior Direito"},{value:"top-center",label:"Topo Centralizado"},{value:"top-right",label:"Canto Superior Direito"},{value:"none",label:"Desativado (Sem nome na tela)"}];
  let rapidMinKillsOptions=[{value:2,label:"2 abates rápidos"},{value:3,label:"3 abates rápidos (Recomendado)"},{value:4,label:"4 abates rápidos"},{value:5,label:"5 abates rápidos"}];
  let rapidWindowOptions=[{value:3,label:"em até 3 segundos (muito rápido)"},{value:5,label:"em até 5 segundos (Recomendado)"},{value:8,label:"em até 8 segundos"},{value:10,label:"em até 10 segundos"}];
  let generatedSequences=(0,W.useMemo)(()=>{
    let firstSequenceNumber=preserveExistingSequences?getNextSequenceNumber(existingSequences):1;
    return buildMatchHighlightsSequences({match,steamIds:selectedSteamIds,rounds:selectedRounds,weapons:selectedWeapons,perspective,minKillsInRound,lifeMode,includeClutches,minClutchOpponents,guaranteeAllPlayers,minSequencesPerPlayer,adaptiveThresholdForLowFraggers,specialFilters,startSecondsBeforeEvent,endSecondsAfterEvent,maxSecondsBetweenEvents,settings,firstSequenceNumber,rapidKillsEnabled,rapidMinKills,rapidWindowSeconds,alwaysIncludeWildcardKills});
  },[match,selectedSteamIds,selectedRounds,selectedWeapons,perspective,minKillsInRound,lifeMode,includeClutches,minClutchOpponents,guaranteeAllPlayers,minSequencesPerPlayer,adaptiveThresholdForLowFraggers,specialFilters,startSecondsBeforeEvent,endSecondsAfterEvent,maxSecondsBetweenEvents,settings,preserveExistingSequences,existingSequences,rapidKillsEnabled,rapidMinKills,rapidWindowSeconds,alwaysIncludeWildcardKills]);
  let finalSequences=(0,W.useMemo)(()=>preserveExistingSequences?sortSequencesByNumber([...existingSequences,...generatedSequences]):generatedSequences,[preserveExistingSequences,existingSequences,generatedSequences]);
  let totalDurationSeconds=(0,W.useMemo)(()=>{
    if(match.tickrate<=0)return 0;
    let introExtra=showIntroScreen&&finalSequences.length>0?8:0;
    let outroExtra=showOutroScreen&&finalSequences.length>0?(showFunAwards?7:5):0;
    return finalSequences.reduce((acc,s)=>acc+Math.max(0,s.endTick-s.startTick),0)/match.tickrate+introExtra+outroExtra;
  },[finalSequences,match.tickrate,showIntroScreen,showOutroScreen,showFunAwards]);
  let includedPlayersCount=(0,W.useMemo)(()=>{
    let s=new Set();
    for(let seq of finalSequences){for(let cam of seq.playerCameras){if(cam.playerSteamId)s.add(cam.playerSteamId);}}
    return s.size;
  },[finalSequences]);
  let formatDur=sec=>{let r=Math.max(0,Math.round(sec)),m=Math.floor(r/60),s=r%60;return`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`};
  let applyPlayers=ids=>{setSelectedSteamIds(ids);setSelectedWeapons(ids.length===0?[]:uniqueArray(match.kills.filter(k=>ids.includes(k.killerSteamId)).map(k=>k.weaponName)))};
  let applyTimelineOnly=()=>{
    if(finalSequences.length===0)return;
    dispatch(Fs({demoFilePath:match.demoFilePath,sequences:finalSequences}));
    hideDialog();
  };
  let applyTimelineAndRecordNow=async()=>{
    if(finalSequences.length===0||isStartingRecording)return;
    setIsStartingRecording(!0);
    await updateSettings({concatenateSequences:!0,hideGameWindow,hudPosition,showIntroScreen,showOutroScreen,showFunAwards,enableKillCounter,enableSlowMotion,enableFastForward,enableSequenceTransitions});
    dispatch(Fs({demoFilePath:match.demoFilePath,sequences:finalSequences}));
    try{
      let payload={...settings,concatenateSequences:!0,hideGameWindow,hudPosition,showIntroScreen,showOutroScreen,showFunAwards,enableKillCounter,enableSlowMotion,enableFastForward,enableSequenceTransitions,checksum:match.checksum,game:match.game,tickrate:match.tickrate,demoPath:match.demoFilePath,mapName:match.mapName,sequences:finalSequences};
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
    (0,Q.jsx)(DialogHeader,{children:(0,Q.jsx)(DialogTitle,{children:"Gerar Highlights da Partida (Timeline & Gravação Automática)"})}),
    (0,Q.jsx)(DialogContent,{children:(0,Q.jsxs)("div",{className:"flex w-[680px] max-h-[78vh] overflow-y-auto flex-col gap-y-12 pr-4",children:[
      (0,Q.jsxs)("div",{className:"flex flex-wrap items-center gap-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong mr-4",children:"Presets Rápidos:"}),
        (0,Q.jsx)(Button$1,{onClick:()=>{setMinKillsInRound(4);setLifeMode("same_body");setIncludeClutches(!0);setMinClutchOpponents(2);setGuaranteeAllPlayers(!0);setMinSequencesPerPlayer(1);setAdaptiveThresholdForLowFraggers(!0);setSpecialFilters({onlyHeadshot:!1,onlyNoScope:!0,onlyThroughSmoke:!0,onlyWallbang:!0,onlyAirborne:!1,onlyBlind:!1,onlyEntryKill:!1,onlyUtilityOrKnife:!0,onlyTradeKill:!1,onlyBombAction:!1,mode:"bonus"})},children:"10x10 Amigos (4K+ Mesmo Boneco + Todos Aparecem)"}),
        (0,Q.jsx)(Button$1,{onClick:()=>{setMinKillsInRound(5);setLifeMode("same_body");setIncludeClutches(!0);setMinClutchOpponents(3);setGuaranteeAllPlayers(!1);setAdaptiveThresholdForLowFraggers(!1);setSpecialFilters({onlyHeadshot:!1,onlyNoScope:!0,onlyThroughSmoke:!0,onlyWallbang:!0,onlyAirborne:!1,onlyBlind:!1,onlyEntryKill:!1,onlyUtilityOrKnife:!1,onlyTradeKill:!1,onlyBombAction:!1,mode:"bonus"})},children:"10x10 Insano (5K+ Mesmo Boneco / Clutches 1v3+)"}),
        (0,Q.jsx)(Button$1,{onClick:()=>{setMinKillsInRound(3);setLifeMode("same_body");setIncludeClutches(!0);setMinClutchOpponents(2);setGuaranteeAllPlayers(!1);setAdaptiveThresholdForLowFraggers(!1);setSpecialFilters({onlyHeadshot:!1,onlyNoScope:!0,onlyThroughSmoke:!0,onlyWallbang:!0,onlyAirborne:!1,onlyBlind:!1,onlyEntryKill:!1,onlyUtilityOrKnife:!1,onlyTradeKill:!1,onlyBombAction:!1,mode:"bonus"})},children:"Padrão (3K+ / Clutches / Bônus)"})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8",children:[
        (0,Q.jsxs)("div",{className:"flex items-center gap-x-8",children:[
          (0,Q.jsx)("span",{className:"text-body-strong",children:"Seleção Rápida de Jogadores:"}),
          (0,Q.jsxs)(Button$1,{onClick:()=>applyPlayers(allSteamIds),children:["Todos (",allSteamIds.length,")"]}),
          (0,Q.jsx)(Button$1,{onClick:()=>applyPlayers(teamASteamIds),children:match.teamA.name}),
          (0,Q.jsx)(Button$1,{onClick:()=>applyPlayers(teamBSteamIds),children:match.teamB.name})
        ]}),
        (0,Q.jsx)(PlayersSelect,{players:match.players,selectedSteamIds,onChange:applyPlayers})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong",children:"Critério de Abates no Round & Controle de Bot (10x10):"}),
        (0,Q.jsx)(Select$1,{label:"Regra de Boneco / Vida no Round (Evitar somar kills após morrer e pegar Bot)",options:lifeModeOptions,value:lifeMode,onChange:setLifeMode}),
        (0,Q.jsxs)("div",{className:"grid grid-cols-2 gap-12",children:[
          (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8",children:[
            (0,Q.jsx)(Select$1,{label:"Mínimo de abates no mesmo boneco/round (1K a 10K)",options:minKillsOptions,value:minKillsInRound,onChange:setMinKillsInRound}),
            (0,Q.jsx)(Select$1,{label:"Perspectiva da Câmera (POV)",options:[{value:Vs.Player,label:"Jogador (Autor do Abate)"},{value:Vs.Enemy,label:"Inimigo (Vítima)"}],value:perspective,onChange:setPerspective})
          ]}),
          (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8",children:[
            (0,Q.jsx)(Checkbox,{label:"Incluir Clutches vencidos automaticamente",isChecked:includeClutches,onChange:e=>setIncludeClutches(e.target.checked)}),
            includeClutches&&(0,Q.jsx)(Select$1,{label:"Mínimo de oponentes no Clutch",options:minClutchOptions,value:minClutchOpponents,onChange:setMinClutchOpponents})
          ]})
        ]}),
        (0,Q.jsx)(Checkbox,{label:"Incluir abates rápidos em sequência (entra no vídeo mesmo sem atingir o mínimo de abates do round)",isChecked:rapidKillsEnabled,onChange:e=>setRapidKillsEnabled(e.target.checked)}),
        rapidKillsEnabled&&(0,Q.jsxs)("div",{className:"grid grid-cols-2 gap-12",children:[
          (0,Q.jsx)(Select$1,{label:"Quantidade de abates rápidos (mesmo boneco)",options:rapidMinKillsOptions,value:rapidMinKills,onChange:setRapidMinKills}),
          (0,Q.jsx)(Select$1,{label:"Janela de tempo entre o 1º e o último abate",options:rapidWindowOptions,value:rapidWindowSeconds,onChange:setRapidWindowSeconds})
        ]})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong",children:"Inclusão de Jogadores com Menos Kills (Para Todos Aparecerem no Highlight):"}),
        (0,Q.jsx)(Checkbox,{label:"Garantir que todos os jogadores selecionados apareçam no vídeo (mesmo sem atingir o mínimo de kills)",isChecked:guaranteeAllPlayers,onChange:e=>setGuaranteeAllPlayers(e.target.checked)}),
        guaranteeAllPlayers&&(0,Q.jsx)(Select$1,{label:"Quantidade mínima de melhores lances garantidos por jogador",options:minSequencesPerPlayerOptions,value:minSequencesPerPlayer,onChange:setMinSequencesPerPlayer}),
        (0,Q.jsx)(Checkbox,{label:"Critério adaptativo: reduzir exigência de kills no round para jogadores na metade inferior do placar",isChecked:adaptiveThresholdForLowFraggers,onChange:e=>setAdaptiveThresholdForLowFraggers(e.target.checked)})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong",children:"Filtros de Abates Especiais & Lances Divertidos:"}),
        (0,Q.jsxs)("div",{className:"grid grid-cols-3 gap-8",children:[
          (0,Q.jsx)(Checkbox,{label:"Headshot (HS)",isChecked:specialFilters.onlyHeadshot,onChange:e=>setSpecialFilters({...specialFilters,onlyHeadshot:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"No-Scope",isChecked:specialFilters.onlyNoScope,onChange:e=>setSpecialFilters({...specialFilters,onlyNoScope:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"Através da Smoke",isChecked:specialFilters.onlyThroughSmoke,onChange:e=>setSpecialFilters({...specialFilters,onlyThroughSmoke:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"Wallbang (Varado)",isChecked:specialFilters.onlyWallbang,onChange:e=>setSpecialFilters({...specialFilters,onlyWallbang:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"No Ar (Airborne)",isChecked:specialFilters.onlyAirborne,onChange:e=>setSpecialFilters({...specialFilters,onlyAirborne:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"Cego de Flash",isChecked:specialFilters.onlyBlind,onChange:e=>setSpecialFilters({...specialFilters,onlyBlind:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"First Kill (Entry)",isChecked:specialFilters.onlyEntryKill,onChange:e=>setSpecialFilters({...specialFilters,onlyEntryKill:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"Faca / Zeus / HE / Molotov",isChecked:specialFilters.onlyUtilityOrKnife,onChange:e=>setSpecialFilters({...specialFilters,onlyUtilityOrKnife:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"Trade Kill (Vingança)",isChecked:specialFilters.onlyTradeKill,onChange:e=>setSpecialFilters({...specialFilters,onlyTradeKill:e.target.checked})}),
          (0,Q.jsx)(Checkbox,{label:"Plantou / Defusou C4",isChecked:specialFilters.onlyBombAction,onChange:e=>setSpecialFilters({...specialFilters,onlyBombAction:e.target.checked})})
        ]}),
        (0,Q.jsx)(Select$1,{label:"Modo dos atributos especiais",options:specialModeOptions,value:specialFilters.mode,onChange:mode=>setSpecialFilters({...specialFilters,mode})})
      ]}),
      (0,Q.jsx)(RoundsSelect,{rounds:match.rounds,selectedRoundNumbers:selectedRounds,onChange:setSelectedRounds}),
      visibleWeapons.length>0&&(0,Q.jsx)(WeaponsFilter,{weapons:visibleWeapons,selectedWeapons,hasActiveFilter:selectedWeapons.length>0&&selectedWeapons.length!==visibleWeapons.length,onChange:setSelectedWeapons}),
      (0,Q.jsxs)("div",{className:"grid grid-cols-3 gap-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)(SecondsInput,{label:"Segundos antes do lance",defaultValue:startSecondsBeforeEvent,onChange:setStartSecondsBeforeEvent}),
        (0,Q.jsx)(SecondsInput,{label:"Segundos após o lance",defaultValue:endSecondsAfterEvent,onChange:setEndSecondsAfterEvent}),
        (0,Q.jsx)(SecondsInput,{label:"Agrupar lances próximos (máx. s)",defaultValue:maxSecondsBetweenEvents,onChange:setMaxSecondsBetweenEvents})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong",children:"Intro (8s), Encerramento (5s/7s), HUD, Contador de Kills & Câmera Lenta:"}),
        (0,Q.jsx)(Select$1,{label:"Posição do Nome na Tela (Formato: POV: Nome do Jogador - Round X)",options:hudPositionOptions,value:hudPosition,onChange:async pos=>{setHudPosition(pos);await updateSettings({hudPosition:pos});}}),
        (0,Q.jsx)(Checkbox,{label:"Contador de kills animado no HUD (1K, Double, Triple, Ace, Clutches e Armas)",isChecked:enableKillCounter,onChange:async e=>{let c=e.target.checked;setEnableKillCounter(c);await updateSettings({enableKillCounter:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Câmera lenta (Slow Motion 0.5x em 120 FPS) em abates épicos (No-Scope, Faca, Wallbang e Clutches)",isChecked:enableSlowMotion,onChange:async e=>{let c=e.target.checked;setEnableSlowMotion(c);await updateSettings({enableSlowMotion:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Incluir tela de introdução no início do vídeo (8s com Mapa, Placar Final e Tabela KDA dos Times)",isChecked:showIntroScreen,onChange:async e=>{let c=e.target.checked;setShowIntroScreen(c);await updateSettings({showIntroScreen:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Incluir tela de encerramento no final do vídeo (Outro com MVP e Destaques da Partida)",isChecked:showOutroScreen,onChange:async e=>{let c=e.target.checked;setShowOutroScreen(c);await updateSettings({showOutroScreen:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Sempre incluir abates coringas (No-Scope, Faca, Zeus, Collat SSG 08 e 1-2 Tiros Seguidos - isentos de filtros)",isChecked:alwaysIncludeWildcardKills,onChange:e=>setAlwaysIncludeWildcardKills(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Avanço rápido (2x) em esperas (> 5s) entre abates (exceto SSG 08, Negev, M249 e XM1014)",isChecked:enableFastForward,onChange:async e=>{let c=e.target.checked;setEnableFastForward(c);await updateSettings({enableFastForward:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Troféus engraçados da partida no encerramento (Destaque cômico para todos os jogadores: Porta da Esperança, Cearense Lover, Bob Marley, Pikachu, etc.)",isChecked:showFunAwards,onChange:async e=>{let c=e.target.checked;setShowFunAwards(c);await updateSettings({showFunAwards:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Transição suave (Fade-In / Fade-Out em vídeo e áudio) entre uma sequência e outra",isChecked:enableSequenceTransitions,onChange:async e=>{let c=e.target.checked;setEnableSequenceTransitions(c);await updateSettings({enableSequenceTransitions:c});}})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)(Checkbox,{label:"Gravar com o CS oculto em 2º plano (Posiciona a janela fora da tela sem roubar o foco do PC)",isChecked:hideGameWindow,onChange:async e=>{let c=e.target.checked;setHideGameWindow(c);await updateSettings({hideGameWindow:c});}}),
        (0,Q.jsx)(Checkbox,{label:"Manter sequências já existentes na timeline",isChecked:preserveExistingSequences,onChange:e=>setPreserveExistingSequences(e.target.checked)})
      ]}),
      (0,Q.jsx)(
        "div",
        { className: "flex items-center justify-between rounded-4 bg-gray-200 p-12" },
        (0, Q.jsxs)("div", {
          className: "flex flex-col",
          children: [
            (0, Q.jsxs)("span", {
              className: "text-body-strong",
              children: [
                "Resumo da Timeline: ",
                finalSequences.length,
                " sequência(s)",
                showIntroScreen ? " + Intro (8s)" : "",
                showOutroScreen ? (showFunAwards ? " + Outro com Troféus (7s)" : " + Outro (5s)") : "",
                " | Jogadores contemplados: ",
                includedPlayersCount,
                " de ",
                selectedSteamIds.length,
              ],
            }),
            (0, Q.jsxs)("span", {
              className: "text-caption",
              children: [
                "Duração estimada: ",
                formatDur(totalDurationSeconds),
                " | Codec GPU: ",
                settings.ffmpegSettings.videoCodec,
                " | HUD: ",
                hudPosition === "none" ? "Desativado" : hudPosition,
                enableKillCounter ? " (Contador Ativo)" : "",
                " | Slow-Mo: ",
                enableSlowMotion ? "0.5x (120 FPS)" : "Off",
                " | Transições: ",
                enableSequenceTransitions ? "Fade Suave" : "Corte Seco",
              ],
            }),
          ],
        }),
      )
    ]})}),
    (0,Q.jsxs)(DialogFooter,{children:[
      (0,Q.jsxs)(Button$1,{variant:zg.Primary,onClick:applyTimelineAndRecordNow,isDisabled:finalSequences.length===0||isStartingRecording,children:["Montar Timeline e Gravar Agora (",finalSequences.length,")"]}),
      (0,Q.jsx)(Button$1,{onClick:applyTimelineOnly,isDisabled:finalSequences.length===0||isStartingRecording,children:"Apenas Montar Timeline"}),
      (0,Q.jsx)(CancelButton,{onClick:hideDialog})
    ]})
  ]});
}
function GenerateMatchHighlightsButton(){
  let{showDialog}=useDialog();
  return(0,Q.jsx)(Button$1,{variant:zg.Primary,onClick:()=>{showDialog((0,Q.jsx)(GenerateMatchHighlightsDialog,{}))},children:"Gerar Highlights da Partida"});
}