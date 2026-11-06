function isHumanSteamIdForLowlights(id){
  let s=String(id??"");
  return s!==""&&s!=="0"&&s.length>5;
}

function buildLowlightsCandidates({match,steamIds,filters={}}){
  let {
    includeHumiliations=true,
    includeSuicides=true,
    includeClutchesLost=true,
    includeWhiffs=true,
    includeDistracted=true,
    includeTeamkills=true
  }=filters;

  let tr=match.tickrate>0?match.tickrate:64;
  let maxTick=match.tickCount>0?match.tickCount:Number.MAX_SAFE_INTEGER;
  let allowed=Array.isArray(steamIds)&&steamIds.length>0?new Set(steamIds):null;
  let kills=[...(match.kills||[])].sort((a,b)=>a.tick-b.tick);
  let clutches=[...(match.clutches||[])].sort((a,b)=>a.tick-b.tick);
  let shots=[...(match.shots||[])].sort((a,b)=>a.tick-b.tick);
  let damages=[...(match.damages||[])].sort((a,b)=>a.tick-b.tick);
  let roundsMap=new Map();
  for(let r of match.rounds||[])roundsMap.set(r.number,r);

  let rawCandidates=[];

  // 1. Humilhações na Faca e Zeus
  if(includeHumiliations){
    for(let k of kills){
      let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
      let wt=String(k.weaponType??k.weapon_type??"").toLowerCase();
      let isKnife=wt==="melee"||wt==="knife"||w.includes("knife")||w.includes("bayonet")||w.includes("karambit")||w.includes("dagger");
      let isZeus=w.includes("taser")||w.includes("zeus");
      if(!isKnife&&!isZeus)continue;

      let vid=k.victimSteamId??k.victim_steam_id;
      let vName=k.victimName??k.victim_name??"";
      let kName=k.killerName??k.killer_name??"Inimigo";
      if(!isHumanSteamIdForLowlights(vid))continue;
      if(allowed&&!allowed.has(vid))continue;

      let rnd=roundsMap.get(k.roundNumber);
      let rStart=rnd?rnd.startTick:1;
      let rEnd=rnd?rnd.endTick:maxTick;

      let startTick=Math.max(rStart,k.tick-Math.round(tr*4.0));
      let endTick=Math.min(rEnd,k.tick+Math.round(tr*2.0));
      let badge=isKnife?`🔪 HUMILHADO NA FACA (POR ${kName})`:`⚡ TOMOU ZEUS (CHOQUE DO ANO)`;
      let desc=isKnife?`Humilhado na Faca por ${kName}`:`Levou choque de Zeus de ${kName}`;
      let score=isKnife?100:95;

      rawCandidates.push({
        steamId:vid,
        playerName:vName,
        roundNumber:k.roundNumber,
        failType:isKnife?"knife":"zeus",
        badge,
        description:desc,
        score,
        failTick:k.tick,
        startTick,
        endTick,
        seconds:Math.max(2,(endTick-startTick)/tr)
      });
    }
  }

  // 2. Suicídios e Auto-dano
  if(includeSuicides){
    for(let k of kills){
      let kid=k.killerSteamId??k.killer_steam_id;
      let vid=k.victimSteamId??k.victim_steam_id;
      let vName=k.victimName??k.victim_name??"";
      let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
      let wt=String(k.weaponType??k.weapon_type??"").toLowerCase();

      let isSelf=(isHumanSteamIdForLowlights(kid)&&kid===vid);
      let isWorld=wt==="world"||w.includes("world")||w.includes("fall");
      if(!isSelf&&!isWorld)continue;
      if(!isHumanSteamIdForLowlights(vid))continue;
      if(allowed&&!allowed.has(vid))continue;

      let rnd=roundsMap.get(k.roundNumber);
      let rStart=rnd?rnd.startTick:1;
      let rEnd=rnd?rnd.endTick:maxTick;

      let badge,desc,score=90;
      if(w.includes("molo")||w.includes("incen")){
        badge="🔥 CHURRASCO PRÓPRIO (MOLOTOV)";
        desc="Morreu para a própria Molotov";
        score=95;
      }else if(w.includes("grenade")||wt==="grenade"){
        badge="💣 EXPLODIU A SI MESMO (GRANADA)";
        desc="Suicídio com a própria Granada HE";
        score=92;
      }else{
        badge="☠️ SUICÍDIO (MORREU DE QUEDA)";
        desc="Suicídio / Morte de queda no mapa";
        score=88;
      }

      let startTick=Math.max(rStart,k.tick-Math.round(tr*4.5));
      let endTick=Math.min(rEnd,k.tick+Math.round(tr*2.0));

      rawCandidates.push({
        steamId:vid,
        playerName:vName,
        roundNumber:k.roundNumber,
        failType:"suicide",
        badge,
        description:desc,
        score,
        failTick:k.tick,
        startTick,
        endTick,
        seconds:Math.max(2,(endTick-startTick)/tr)
      });
    }
  }

  // 3. Pipocadas no Clutch 1v1
  if(includeClutchesLost){
    for(let c of clutches){
      if(c.won||(c.opponentCount??c.opponent_count)!==1)continue;
      let cid=c.clutcherSteamId??c.clutcher_steam_id;
      let cName=c.clutcherName??c.clutcher_name??"";
      if(!isHumanSteamIdForLowlights(cid))continue;
      if(allowed&&!allowed.has(cid))continue;

      let rNum=c.roundNumber??c.round_number;
      let rnd=roundsMap.get(rNum);
      let rStart=rnd?rnd.startTick:1;
      let rEnd=rnd?rnd.endTick:maxTick;

      let death=kills.find(k=>(k.roundNumber??k.round_number)===rNum&&(k.victimSteamId??k.victim_steam_id)===cid);
      let evTick=death?death.tick:c.tick;

      let startTick=Math.max(rStart,evTick-Math.round(tr*5.5));
      let endTick=Math.min(rEnd,evTick+Math.round(tr*2.0));

      rawCandidates.push({
        steamId:cid,
        playerName:cName,
        roundNumber:rNum,
        failType:"clutch",
        badge:"🥶 PIPOCOU NO 1v1 (CLUTCH PERDIDO)",
        description:"Pipocou no Clutch 1v1 decisivo",
        score:85,
        failTick:evTick,
        startTick,
        endTick,
        seconds:Math.max(2,(endTick-startTick)/tr)
      });
    }
  }

  // 4. Whiffs Brutais (Spray no Vento)
  if(includeWhiffs){
    for(let k of kills){
      let vid=k.victimSteamId??k.victim_steam_id;
      let vName=k.victimName??k.victim_name??"";
      let rNum=k.roundNumber??k.round_number;
      if(!isHumanSteamIdForLowlights(vid))continue;
      if(allowed&&!allowed.has(vid))continue;

      // Disparos do jogador nos últimos 3 segundos (192 ticks) antes de morrer
      let pShots=shots.filter(s=>(s.roundNumber??s.round_number)===rNum&&(s.playerSteamId??s.player_steam_id)===vid&&s.tick>=k.tick-192&&s.tick<=k.tick);
      // Descartar faca ou utilitários
      let gunShots=pShots.filter(s=>{
        let sw=String(s.weaponName??s.weapon_name??"").toLowerCase();
        return !["knife","bayonet","karambit","dagger","flashbang","smoke","hegrenade","molotov","incendiary","decoy"].some(x=>sw.includes(x));
      });

      if(gunShots.length>=7){
        let pDmg=damages.filter(d=>(d.roundNumber??d.round_number)===rNum&&(d.attackerSteamId??d.attacker_steam_id)===vid&&d.tick>=k.tick-192&&d.tick<=k.tick);
        let totalDmg=pDmg.reduce((acc,d)=>acc+(d.healthDamage??d.health_damage??0),0);
        if(totalDmg<=20){
          let rnd=roundsMap.get(rNum);
          let rStart=rnd?rnd.startTick:1;
          let rEnd=rnd?rnd.endTick:maxTick;
          let wpName=gunShots[0].weaponName??gunShots[0].weapon_name??"Arma";
          let firstShotTick=gunShots[0].tick;
          let startTick=Math.max(rStart,firstShotTick-Math.round(tr*1.2));
          let endTick=Math.min(rEnd,k.tick+Math.round(tr*2.0));

          rawCandidates.push({
            steamId:vid,
            playerName:vName,
            roundNumber:rNum,
            failType:"whiff",
            badge:`💨 WHIFF BRUTAL (${gunShots.length} TIROS NO VENTO DE ${wpName})`,
            description:`Whiff brutal: ${gunShots.length} tiros no vento de ${wpName} (${totalDmg} dmg)`,
            score:75+Math.min(15,gunShots.length),
            failTick:k.tick,
            startTick,
            endTick,
            seconds:Math.max(2,(endTick-startTick)/tr)
          });
        }
      }
    }
  }

  // 5. Mortes Distraídas (Cego ou Inspecionando Arma)
  if(includeDistracted){
    for(let k of kills){
      let vid=k.victimSteamId??k.victim_steam_id;
      let vName=k.victimName??k.victim_name??"";
      let rNum=k.roundNumber??k.round_number;
      if(!isHumanSteamIdForLowlights(vid))continue;
      if(allowed&&!allowed.has(vid))continue;

      let isInspect=Boolean(k.isVictimInspectingWeapon??k.is_victim_inspecting_weapon);
      let isBlind=Boolean(k.isVictimBlinded??k.is_victim_blinded);
      if(!isInspect&&!isBlind)continue;

      let rnd=roundsMap.get(rNum);
      let rStart=rnd?rnd.startTick:1;
      let rEnd=rnd?rnd.endTick:maxTick;
      let startTick=Math.max(rStart,k.tick-Math.round(tr*3.5));
      let endTick=Math.min(rEnd,k.tick+Math.round(tr*2.0));

      if(isInspect){
        rawCandidates.push({
          steamId:vid,
          playerName:vName,
          roundNumber:rNum,
          failType:"inspect",
          badge:"🔎 MORREU ADMIRANDO A SKIN (INSPECIONANDO)",
          description:"Morreu admirando a skin no meio da trocação",
          score:72,
          failTick:k.tick,
          startTick,
          endTick,
          seconds:Math.max(2,(endTick-startTick)/tr)
        });
      }else if(isBlind){
        rawCandidates.push({
          steamId:vid,
          playerName:vName,
          roundNumber:rNum,
          failType:"blind",
          badge:"🕶️ MORREU TOTALMENTE CEGO",
          description:"Morreu 100% cego andando tonto na flash",
          score:60,
          failTick:k.tick,
          startTick,
          endTick,
          seconds:Math.max(2,(endTick-startTick)/tr)
        });
      }
    }
  }

  // 6. Fogo Amigo (Teamkill)
  if(includeTeamkills){
    for(let k of kills){
      let kid=k.killerSteamId??k.killer_steam_id;
      let vid=k.victimSteamId??k.victim_steam_id;
      let kTeam=k.killerTeamName??k.killer_team_name;
      let vTeam=k.victimTeamName??k.victim_team_name;
      let kName=k.killerName??k.killer_name??"";
      let vName=k.victimName??k.victim_name??"";
      let rNum=k.roundNumber??k.round_number;

      if(!isHumanSteamIdForLowlights(kid)||!isHumanSteamIdForLowlights(vid))continue;
      if(kid===vid)continue;
      if(!kTeam||!vTeam||kTeam!==vTeam)continue;
      if(allowed&&!allowed.has(kid))continue;

      let rnd=roundsMap.get(rNum);
      let rStart=rnd?rnd.startTick:1;
      let rEnd=rnd?rnd.endTick:maxTick;
      let startTick=Math.max(rStart,k.tick-Math.round(tr*3.5));
      let endTick=Math.min(rEnd,k.tick+Math.round(tr*2.0));

      rawCandidates.push({
        steamId:kid,
        playerName:kName,
        roundNumber:rNum,
        failType:"teamkill",
        badge:`🚫 FOGO AMIGO (MATOU O COMPANHEIRO ${vName})`,
        description:`Fogo amigo: abateu o próprio parceiro (${vName})`,
        score:92,
        failTick:k.tick,
        startTick,
        endTick,
        seconds:Math.max(2,(endTick-startTick)/tr)
      });
    }
  }

  // Agrupar/mesclar eventos coincidentes para o mesmo jogador no mesmo round (ex: whiff + faca)
  rawCandidates.sort((a,b)=>a.roundNumber-b.roundNumber||a.startTick-b.startTick);
  let mergedCandidates=[];
  let minGapTicks=Math.round(tr*3.0);

  for(let c of rawCandidates){
    let existing=mergedCandidates.find(x=>x.roundNumber===c.roundNumber&&x.steamId===c.steamId&&c.startTick<=x.endTick+minGapTicks&&c.endTick>=x.startTick-minGapTicks);
    if(existing){
      existing.startTick=Math.min(existing.startTick,c.startTick);
      existing.endTick=Math.max(existing.endTick,c.endTick);
      existing.score=Math.min(150,existing.score+Math.round(c.score*0.5));
      existing.description+=` + ${c.description}`;
      existing.badge=`${existing.badge} + ${c.badge}`;
      existing.seconds=Math.max(2,(existing.endTick-existing.startTick)/tr);
    }else{
      mergedCandidates.push({...c});
    }
  }

  return mergedCandidates;
}

function buildLowlightsSequences({match,steamIds,filters={},maxDurationSeconds=120,includeIntro=true,includeOutro=true,settings={},firstSequenceNumber=1}){
  let tr=match.tickrate>0?match.tickrate:64;
  let candidates=buildLowlightsCandidates({match,steamIds,filters});
  let introExtra=includeIntro?8:0,outroExtra=includeOutro?5:0;
  let budget=Math.max(10,maxDurationSeconds-introExtra-outroExtra),used=0,chosen=[],perPlayer=new Map(),remaining=[...candidates];
  let minGapTicks=Math.round(tr*4);

  // Ordenar prioritariamente pelas maiores trapalhadas
  remaining.sort((a,b)=>b.score-a.score);

  while(remaining.length>0){
    let bestIdx=-1,bestVal=-1;
    for(let i=0;i<remaining.length;i++){
      let c=remaining[i];
      if(used+c.seconds>budget)continue;
      if(chosen.some(s=>s.roundNumber===c.roundNumber&&c.startTick<=s.endTick+minGapTicks&&c.endTick>=s.startTick-minGapTicks))continue;
      let countForPlayer=perPlayer.get(c.steamId)??0;
      let val=c.score*Math.pow(0.80,countForPlayer);
      if(val>bestVal){
        bestVal=val;
        bestIdx=i;
      }
    }
    if(bestIdx===-1)break;
    let pick=remaining.splice(bestIdx,1)[0];
    chosen.push(pick);
    used+=pick.seconds;
    perPlayer.set(pick.steamId,(perPlayer.get(pick.steamId)??0)+1);
  }

  // Se o orçamento permitir e não escolhemos nada ainda (poucos lances), pegar o lance de maior nota mesmo que passe um pouco
  if(chosen.length===0&&remaining.length>0){
    let pick=remaining[0];
    chosen.push(pick);
    used+=pick.seconds;
  }

  chosen.sort((a,b)=>a.roundNumber-b.roundNumber||a.startTick-b.startTick);

  let totalChosenSeconds=chosen.reduce((acc,c)=>acc+c.seconds,0);
  let sequences=chosen.map((c,i)=>({
    number:firstSequenceNumber+i,
    startTick:c.startTick,
    endTick:c.endTick,
    roundNumber:c.roundNumber,
    isLowlight:true,
    lowlightBadge:c.badge,
    lowlightTick:c.failTick,
    lowlightPlayerSteamId:c.steamId,
    fastForwardIntervals:[],
    showOnlyDeathNotices:settings.showOnlyDeathNotices,
    deathNoticesDuration:settings.deathNoticesDuration,
    showXRay:settings.showXRay,
    showAssists:settings.showAssists,
    recordAudio:settings.recordAudio,
    playerVoicesEnabled:settings.playerVoicesEnabled,
    playersOptions:buildPlayersOptions(match.players,[c.steamId]),
    playerCameras:[{
      tick:c.startTick,
      playerSteamId:c.steamId,
      playerName:c.playerName,
      roundNumber:c.roundNumber,
      isLowlight:true,
      lowlightBadge:c.badge
    }],
    cameras:[]
  }));

  return {
    sequences,
    plays:chosen,
    totalSeconds:totalChosenSeconds+(chosen.length>0?introExtra+outroExtra:0),
    candidatesCount:candidates.length
  };
}

function GenerateLowlightsDialog(){
  let dispatch=Mu(),match=useCurrentMatch$2(),{settings,updateSettings}=useVideoSettings(),{hideDialog,showDialog}=useDialog(),client=useWebSocketClient(),navigate=useNavigate();
  let allSteamIds=(0,W.useMemo)(()=>match.players.map(p=>p.steamId),[match.players]);
  let teamASteamIds=(0,W.useMemo)(()=>match.players.filter(p=>p.teamName===match.teamA.name).map(p=>p.steamId),[match.players,match.teamA.name]);
  let teamBSteamIds=(0,W.useMemo)(()=>match.players.filter(p=>p.teamName===match.teamB.name).map(p=>p.steamId),[match.players,match.teamB.name]);
  let[selectedSteamIds,setSelectedSteamIds]=(0,W.useState)(allSteamIds);
  let[maxDurationSeconds,setMaxDurationSeconds]=(0,W.useState)(120);

  let[includeHumiliations,setIncludeHumiliations]=(0,W.useState)(!0);
  let[includeSuicides,setIncludeSuicides]=(0,W.useState)(!0);
  let[includeClutchesLost,setIncludeClutchesLost]=(0,W.useState)(!0);
  let[includeWhiffs,setIncludeWhiffs]=(0,W.useState)(!0);
  let[includeDistracted,setIncludeDistracted]=(0,W.useState)(!0);
  let[includeTeamkills,setIncludeTeamkills]=(0,W.useState)(!0);

  let[hudPosition,setHudPosition]=(0,W.useState)(settings.hudPosition??"top-left");
  let[showIntroScreen,setShowIntroScreen]=(0,W.useState)(settings.showIntroScreen??!0);
  let[showOutroScreen,setShowOutroScreen]=(0,W.useState)(settings.showOutroScreen??!0);
  let[showFunAwards,setShowFunAwards]=(0,W.useState)(settings.showFunAwards??!0);
  let[enableKillCounter,setEnableKillCounter]=(0,W.useState)(settings.enableKillCounter??!0);
  let[enableSlowMotion,setEnableSlowMotion]=(0,W.useState)(settings.enableSlowMotion??!0);
  let[enableSequenceTransitions,setEnableSequenceTransitions]=(0,W.useState)(settings.enableSequenceTransitions??!0);
  let[hideGameWindow,setHideGameWindow]=(0,W.useState)(settings.hideGameWindow??!0);
  let[isStartingRecording,setIsStartingRecording]=(0,W.useState)(!1);

  let durationOptions=[
    {value:60,label:"Até 1 minuto"},
    {value:90,label:"Até 1 min 30 s"},
    {value:120,label:"Até 2 minutos (Recomendado)"},
    {value:180,label:"Até 3 minutos"},
    {value:300,label:"Até 5 minutos (Todos os bagres)"}
  ];
  let hudPositionOptions=[
    {value:"top-left",label:"Canto Superior Esquerdo (Recomendado)"},
    {value:"bottom-left",label:"Canto Inferior Esquerdo"},
    {value:"bottom-right",label:"Canto Inferior Direito"},
    {value:"top-center",label:"Topo Centralizado"},
    {value:"top-right",label:"Canto Superior Direito"},
    {value:"none",label:"Desativado (Sem nome na tela)"}
  ];

  let filters=(0,W.useMemo)(()=>({
    includeHumiliations,
    includeSuicides,
    includeClutchesLost,
    includeWhiffs,
    includeDistracted,
    includeTeamkills
  }),[includeHumiliations,includeSuicides,includeClutchesLost,includeWhiffs,includeDistracted,includeTeamkills]);

  let result=(0,W.useMemo)(()=>buildLowlightsSequences({
    match,
    steamIds:selectedSteamIds,
    filters,
    maxDurationSeconds,
    includeIntro:showIntroScreen,
    includeOutro:showOutroScreen,
    settings,
    firstSequenceNumber:1
  }),[match,selectedSteamIds,filters,maxDurationSeconds,showIntroScreen,showOutroScreen,settings]);

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
      let payload={
        ...settings,
        concatenateSequences:!0,
        hideGameWindow,
        hudPosition,
        showIntroScreen,
        showOutroScreen,
        showFunAwards,
        enableKillCounter,
        enableSlowMotion,
        enableSequenceTransitions,
        checksum:match.checksum,
        game:match.game,
        tickrate:match.tickrate,
        demoPath:match.demoFilePath,
        mapName:match.mapName,
        sequences:result.sequences
      };
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

  return (0,Q.jsxs)(Dialog$1,{onEnterPressed:applyTimelineOnly,children:[
    (0,Q.jsx)(DialogHeader,{children:(0,Q.jsx)(DialogTitle,{children:"Piores Momentos da Partida 🤡 (Compilado de Bagres)"})}),
    (0,Q.jsx)(DialogContent,{children:(0,Q.jsxs)("div",{className:"flex w-[700px] max-h-[78vh] overflow-y-auto flex-col gap-y-12 pr-4",children:[
      (0,Q.jsx)("p",{className:"text-caption",children:"O compilado de Piores Momentos vasculha a partida atrás das maiores trapalhadas e presepadas: humilhações na faca e no zeus, suicídios (molotov e quedas), pipocadas em clutches 1v1, whiffs brutais (spray no vento), mortes inspecionando arma ou 100% cego, e fogo amigo. A câmera acompanha o ponto de vista (POV) de quem cometeu a trapalhada!"}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-8",children:[
        (0,Q.jsxs)("div",{className:"flex items-center gap-x-8",children:[
          (0,Q.jsx)("span",{className:"text-body-strong",children:"Jogadores bagres a zuar:"}),
          (0,Q.jsxs)(Button$1,{onClick:()=>setSelectedSteamIds(allSteamIds),children:["Todos (",allSteamIds.length,")"]}),
          (0,Q.jsx)(Button$1,{onClick:()=>setSelectedSteamIds(teamASteamIds),children:match.teamA.name}),
          (0,Q.jsx)(Button$1,{onClick:()=>setSelectedSteamIds(teamBSteamIds),children:match.teamB.name})
        ]}),
        (0,Q.jsx)(PlayersSelect,{players:match.players,selectedSteamIds,onChange:setSelectedSteamIds})
      ]}),
      (0,Q.jsxs)("div",{className:"grid grid-cols-2 gap-12 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)(Select$1,{label:"Duração máxima do vídeo de bagres",options:durationOptions,value:maxDurationSeconds,onChange:setMaxDurationSeconds}),
        (0,Q.jsx)(Select$1,{label:"Posição do HUD (POV: Bagre - Round X)",options:hudPositionOptions,value:hudPosition,onChange:setHudPosition})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-6 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong",children:"Categorias de Trapalhadas a incluir:"}),
        (0,Q.jsxs)("div",{className:"grid grid-cols-2 gap-x-8 gap-y-6",children:[
          (0,Q.jsx)(Checkbox,{label:"🔪 Humilhação na Faca & ⚡ Zeus sofrido",isChecked:includeHumiliations,onChange:e=>setIncludeHumiliations(e.target.checked)}),
          (0,Q.jsx)(Checkbox,{label:"🔥 Suicídios (Molotov própria, HE e Quedas)",isChecked:includeSuicides,onChange:e=>setIncludeSuicides(e.target.checked)}),
          (0,Q.jsx)(Checkbox,{label:"🥶 Pipocadas no Clutch 1v1",isChecked:includeClutchesLost,onChange:e=>setIncludeClutchesLost(e.target.checked)}),
          (0,Q.jsx)(Checkbox,{label:"💨 Whiffs Brutais (7+ tiros no vento)",isChecked:includeWhiffs,onChange:e=>setIncludeWhiffs(e.target.checked)}),
          (0,Q.jsx)(Checkbox,{label:"🔎 Admirando Skin & 🕶️ Morto 100% Cego",isChecked:includeDistracted,onChange:e=>setIncludeDistracted(e.target.checked)}),
          (0,Q.jsx)(Checkbox,{label:"🚫 Fogo Amigo (Abate de colega de time)",isChecked:includeTeamkills,onChange:e=>setIncludeTeamkills(e.target.checked)})
        ]})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-6 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsx)("span",{className:"text-body-strong",children:"Efeitos e Gravação:"}),
        (0,Q.jsx)(Checkbox,{label:"Badges cômicos de bagre no HUD (ex: HUMILHADO NA FACA, CHURRASCO PRÓPRIO, WHIFF)",isChecked:enableKillCounter,onChange:e=>setEnableKillCounter(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Câmera lenta (Slow Motion 0.5x) no exato instante do fail",isChecked:enableSlowMotion,onChange:e=>setEnableSlowMotion(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Tela de introdução de 8s (Mapa, Placar Final e KDA)",isChecked:showIntroScreen,onChange:e=>setShowIntroScreen(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Troféus Engraçados no encerramento (Porta da Esperança, Cearense Lover, Bob Marley, Pikachu, etc.)",isChecked:showFunAwards&&showOutroScreen,onChange:e=>{setShowFunAwards(e.target.checked);setShowOutroScreen(e.target.checked);}}),
        (0,Q.jsx)(Checkbox,{label:"Transição suave (Fade) entre as trapalhadas",isChecked:enableSequenceTransitions,onChange:e=>setEnableSequenceTransitions(e.target.checked)}),
        (0,Q.jsx)(Checkbox,{label:"Gravar com o CS oculto em 2º plano",isChecked:hideGameWindow,onChange:e=>setHideGameWindow(e.target.checked)})
      ]}),
      (0,Q.jsxs)("div",{className:"flex flex-col gap-y-4 rounded-4 border border-gray-400 p-8",children:[
        (0,Q.jsxs)("span",{className:"text-body-strong",children:["Fails escolhidos (",result.plays.length," de ",result.candidatesCount," trapalhadas):"]}),
        result.plays.length===0?(0,Q.jsx)("span",{className:"text-caption",children:"Nenhuma trapalhada encontrada para os filtros e jogadores selecionados."}):(0,Q.jsx)("div",{className:"flex flex-col gap-y-2 max-h-[260px] overflow-y-auto pr-4",children:result.plays.map((p,i)=>(0,Q.jsxs)("div",{
          className:"group flex items-center justify-between gap-x-8 text-caption border-b border-gray-300 px-8 py-4 rounded-4 transition-colors duration-75 hover:bg-gray-300 cursor-default",
          onMouseEnter:e=>{e.currentTarget.style.backgroundColor="var(--gray-300,#dbdbdb)"},
          onMouseLeave:e=>{e.currentTarget.style.backgroundColor=""},
          children:[
            (0,Q.jsxs)("div",{className:"flex items-center gap-x-4 min-w-0 truncate",children:[
              (0,Q.jsx)("span",{className:"font-medium text-gray-500",children:`${String(i+1).padStart(2,"0")}.`}),
              (0,Q.jsx)("span",{className:"font-bold text-gray-900",children:`Round ${p.roundNumber}`}),
              (0,Q.jsx)("span",{className:"text-gray-400",children:"•"}),
              (0,Q.jsx)("span",{className:"font-bold text-gray-900",children:p.playerName}),
              (0,Q.jsx)("span",{className:"text-gray-400",children:"•"}),
              (0,Q.jsx)("span",{className:"text-gray-700",children:p.description})
            ]}),
            (0,Q.jsx)("div",{className:"flex-1 mx-8 border-b border-dotted border-gray-400 opacity-40 group-hover:opacity-80"}),
            (0,Q.jsxs)("div",{className:"flex items-center gap-x-8 whitespace-nowrap",children:[
              (0,Q.jsx)("span",{className:"text-gray-500 font-medium",children:`${Math.round(p.seconds)}s`}),
              (0,Q.jsx)("span",{className:"text-body-strong font-bold px-6 py-2 rounded-4 bg-red-100 text-red-700",children:`nota ${p.score}`})
            ]})
          ]
        },`${p.steamId}-${p.startTick}-${i}`))})
      ]}),
      (0,Q.jsx)("div",{className:"rounded-4 bg-gray-200 p-12",children:(0,Q.jsxs)("span",{className:"text-body-strong",children:["Duração total estimada: ",formatDur(result.totalSeconds)," de ",formatDur(maxDurationSeconds)]})})
    ]})}),
    (0,Q.jsxs)(DialogFooter,{children:[
      (0,Q.jsxs)(Button$1,{variant:zg.Primary,onClick:recordNow,isDisabled:result.sequences.length===0||isStartingRecording,children:["Gerar e Gravar Piores Momentos (",result.sequences.length,")"]}),
      (0,Q.jsx)(Button$1,{onClick:applyTimelineOnly,isDisabled:result.sequences.length===0||isStartingRecording,children:"Apenas Montar Timeline"}),
      (0,Q.jsx)(CancelButton,{onClick:hideDialog})
    ]})
  ]});
}

function GenerateLowlightsButton(){
  let{showDialog}=useDialog();
  return (0,Q.jsx)(Button$1,{variant:zg.Secondary,onClick:()=>{showDialog((0,Q.jsx)(GenerateLowlightsDialog,{}))},children:"Piores Momentos 🤡 (Lowlights)"});
}
