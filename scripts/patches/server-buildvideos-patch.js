async function reconcileMatchPlayerTeams(checksum){
  try{
    let econRows=await I.selectFrom("player_economies as pe")
      .innerJoin("rounds as r",j=>j.onRef("r.match_checksum","=","pe.match_checksum").onRef("r.number","=","pe.round_number"))
      .select(["pe.player_steam_id as sid","r.team_a_name as teamA","r.team_b_name as teamB","pe.player_side as side","r.team_a_side as sideA","r.team_b_side as sideB"])
      .where("pe.match_checksum","=",checksum)
      .where("pe.player_steam_id","!=","0")
      .execute();
    if(!econRows||econRows.length===0)return;
    let counts=new Map(),tNames={teamA:econRows[0].teamA,teamB:econRows[0].teamB};
    for(let row of econRows){
      if(!counts.has(row.sid))counts.set(row.sid,{a:0,b:0});
      let c=counts.get(row.sid);
      if(row.side===row.sideA)c.a++;
      else if(row.side===row.sideB)c.b++;
    }
    for(let[sid,c]of counts.entries()){
      let trueTeam=c.a>=c.b?tNames.teamA:tNames.teamB;
      await I.updateTable("players").set({team_name:trueTeam}).where("match_checksum","=",checksum).where("steam_id","=",sid).execute();
    }
  }catch(e){logger.warn("reconcileMatchPlayerTeams error:",e)}
}
async function fetchMatchIntroHudCtx(checksum){
  try{
    await reconcileMatchPlayerTeams(checksum);
    let isHumanId=id=>{let s=String(id??"");return s!==""&&s!=="0"&&s.length>5};
    let[demoRow,teamRows,playerRows,roundRows,killRows,clutchRows,shotRows,damageRows]=await Promise.all([
      I.selectFrom("demos").select(["date","map_name"]).where("checksum","=",checksum).executeTakeFirst(),
      I.selectFrom("teams").select(["name","score","letter"]).where("match_checksum","=",checksum).orderBy("letter","asc").execute(),
      I.selectFrom("players").select(["steam_id","name","team_name","kill_count","death_count","assist_count"]).where("match_checksum","=",checksum).execute(),
      I.selectFrom("rounds").select(["number","start_tick","end_tick"]).where("match_checksum","=",checksum).orderBy("number","asc").execute(),
      I.selectFrom("kills").select(["id","tick","round_number","killer_steam_id","killer_name","killer_team_name","victim_steam_id","victim_name","victim_team_name","assister_steam_id","assister_team_name","weapon_name","weapon_type","is_headshot","is_no_scope","is_through_smoke","penetrated_objects","is_killer_controlling_bot","is_killer_airborne","is_killer_blinded","is_victim_blinded","is_victim_inspecting_weapon","is_trade_kill"]).where("match_checksum","=",checksum).orderBy("tick","asc").execute(),
      I.selectFrom("clutches").select(["round_number","tick","clutcher_steam_id","clutcher_name","opponent_count","won"]).where("match_checksum","=",checksum).execute().catch(()=>[]),
      I.selectFrom("shots").select(["round_number","tick","player_steam_id","weapon_name"]).where("match_checksum","=",checksum).orderBy("tick","asc").execute().catch(()=>[]),
      I.selectFrom("damages").select(["round_number","tick","health_damage","attacker_steam_id","victim_steam_id"]).where("match_checksum","=",checksum).execute().catch(()=>[])
    ]);
    let precStreaks=detectPrecisionKillStreaks(killRows,shotRows);
    let kMap=new Map(),dMap=new Map(),aMap=new Map(),humKMap=new Map(),botKMap=new Map(),hsMap=new Map(),ssgCollatMap=new Map();
    for(let k of killRows){
      let kid=String(k.killer_steam_id??""),vid=String(k.victim_steam_id??""),aid=String(k.assister_steam_id??"");
      let kw=String(k.weapon_name??"").toLowerCase();
      if((kw.includes("ssg")||kw.includes("scout"))&&kid){
        let kKey=`${k.round_number}:${kid}:${k.tick}`;
        ssgCollatMap.set(kKey,(ssgCollatMap.get(kKey)??0)+1);
      }
      if(kid&&kid!=="0"&&kid!==vid&&(!k.killer_team_name||!k.victim_team_name||k.killer_team_name!==k.victim_team_name)){
        kMap.set(kid,(kMap.get(kid)??0)+1);
        if(isHumanId(vid)&&!/^bot\b/i.test(k.victim_name||""))humKMap.set(kid,(humKMap.get(kid)??0)+1);
        else botKMap.set(kid,(botKMap.get(kid)??0)+1);
        if(k.is_headshot)hsMap.set(kid,(hsMap.get(kid)??0)+1);
      }
      if(vid&&vid!=="0")dMap.set(vid,(dMap.get(vid)??0)+1);
      if(aid&&aid!=="0"&&(!k.assister_team_name||!k.victim_team_name||k.assister_team_name!==k.victim_team_name))aMap.set(aid,(aMap.get(aid)??0)+1);
    }
    let tA=teamRows.find(t=>t.letter==="A")||teamRows[0]||{name:"Team A",score:0},tB=teamRows.find(t=>t.letter==="B")||teamRows[1]||{name:"Team B",score:0};    let humanPlayersWithStats=playerRows.filter(p=>isHumanId(p.steam_id)&&!/^bot\b/i.test(p.name||"")).map(p=>{
      let sid=String(p.steam_id??"");
      let k=Math.max(Number(p.kill_count??0),kMap.get(sid)??0),d=Math.max(Number(p.death_count??0),dMap.get(sid)??0),a=Math.max(Number(p.assist_count??0),aMap.get(sid)??0);
      let humK=humKMap.get(sid)??Math.round(k*0.75),botK=botKMap.get(sid)??Math.max(0,k-humK),hs=hsMap.get(sid)??0;
      let kd=(k/Math.max(1,d)).toFixed(2),hsRate=Math.round((hs/Math.max(1,k))*100),mvpScore=k*2+a-d;
      return{steamId:sid,name:p.name,teamName:p.team_name,killCount:k,deathCount:d,assistCount:a,kd,humanKills:humK,botKills:botK,hsRate,hsCount:hs,mvpScore};
    });
    humanPlayersWithStats.sort((x,y)=>y.mvpScore!==x.mvpScore?y.mvpScore-x.mvpScore:y.killCount-x.killCount);
    let topMvp=humanPlayersWithStats[0]??{name:"Jogador",teamName:"Equipe",killCount:0,deathCount:0,assistCount:0,kd:"1.00",humanKills:0,botKills:0,hsRate:0};
    let topKdPlayer=[...humanPlayersWithStats].sort((x,y)=>parseFloat(y.kd)-parseFloat(x.kd))[0];
    let topHsPlayer=[...humanPlayersWithStats].sort((x,y)=>y.hsRate-x.hsRate)[0];
    let wonClutches=(clutchRows||[]).filter(c=>c.won&&isHumanId(c.clutcher_steam_id));
    wonClutches.sort((x,y)=>y.opponent_count-x.opponent_count);
    let bestClutch=wonClutches[0];
    let outroHighlights=[
      {label:"• MELHOR JOGADOR (MVP)",value:`${topMvp.name} (${topMvp.killCount} Kills, ${topMvp.kd} K/D)`},
      {label:"• MAIOR K/D RATIO",value:topKdPlayer?`${topKdPlayer.name} - ${topKdPlayer.kd} K/D (${topKdPlayer.killCount} Kills)`:"N/A"},
      {label:"• MIRA DE OURO (HEADSHOT)",value:topHsPlayer?`${topHsPlayer.name} - ${topHsPlayer.hsRate}% Headshots (${topHsPlayer.hsCount} HS)`:"N/A"},
      {label:"• CLUTCHER DO JOGO",value:bestClutch?`${bestClutch.clutcher_name||"Jogador"} - Clutch 1v${bestClutch.opponent_count} Vencido (Round ${bestClutch.round_number})`:"Nenhum clutch vencido na partida"}
    ];
    return{
      matchDate:demoRow?.date,
      mapName:demoRow?.map_name||"",
      teamAName:tA.name,
      teamAScore:Number(tA.score??0),
      teamBName:tB.name,
      teamBScore:Number(tB.score??0),
      players:playerRows.map(p=>{let sid=String(p.steam_id??"");return{steamId:sid,name:p.name,teamName:p.team_name,killCount:Math.max(Number(p.kill_count??0),kMap.get(sid)??0),deathCount:Math.max(Number(p.death_count??0),dMap.get(sid)??0),assistCount:Math.max(Number(p.assist_count??0),aMap.get(sid)??0),isBot:!1}}),
      rounds:roundRows.map(r=>({number:Number(r.number),startTick:Number(r.start_tick),endTick:Number(r.end_tick)})),
      kills:killRows.map(k=>({id:k.id,tick:Number(k.tick),roundNumber:Number(k.round_number),killerSteamId:k.killer_steam_id??void 0,killerName:k.killer_name??void 0,killerTeamName:k.killer_team_name??void 0,victimSteamId:k.victim_steam_id??void 0,victimName:k.victim_name??void 0,victimTeamName:k.victim_team_name??void 0,weaponName:k.weapon_name??void 0,weaponType:k.weapon_type??void 0,isHeadshot:Boolean(k.is_headshot),isNoScope:Boolean(k.is_no_scope),isThroughSmoke:Boolean(k.is_through_smoke),penetratedObjects:Number(k.penetrated_objects??0),isKillerControllingBot:Boolean(k.is_killer_controlling_bot),isPrecisionStreak:Boolean(precStreaks.get(k.id)),precisionStreakIdx:precStreaks.get(k.id)?.streakIndex,precisionStreakLen:precStreaks.get(k.id)?.streakLength,precisionStreakId:precStreaks.get(k.id)?.streakId,isOneShotStreak:Boolean(precStreaks.get(k.id)),oneShotStreakIdx:precStreaks.get(k.id)?.streakIndex,oneShotStreakLen:precStreaks.get(k.id)?.streakLength,isSsgCollat:(ssgCollatMap.get(`${k.round_number}:${k.killer_steam_id}:${k.tick}`)??0)>=2})),
      clutches:(clutchRows||[]).map(c=>({roundNumber:Number(c.round_number),tick:Number(c.tick??0),clutcherSteamId:c.clutcher_steam_id??void 0,clutcherName:c.clutcher_name??void 0,opponentCount:Number(c.opponent_count??1),won:Boolean(c.won)})),
      mvp:topMvp,
      highlights:outroHighlights,
      funAwards:computeFunPlayerAwards(humanPlayersWithStats,killRows,clutchRows,demoRow?.map_name),
      lowlightsCtx:computeLowlightsAwards(humanPlayersWithStats,killRows,clutchRows,shotRows,damageRows,demoRow?.map_name)
    };
  }catch(err){
    logger.error("Failed to fetch match context for intro/HUD/outro",err);
    return void 0;
  }
}
async function Ayt({signal:t,...e}){
  yA(t);
  let{recordingSystem:r,recordingOutput:n,encoderSoftware:o,framerate:i,sequences:s,outputFolderPath:a,concatenateSequences:c,outputFileName:l,ffmpegSettings:u,game:A,onSequenceStart:d,onConcatenateSequencesStart:f}=e;
  let curSet=await he(),vSet=curSet?.video??{};
  let hudPos=e.hudPosition??vSet.hudPosition??"top-left",showIntro=e.showIntroScreen??vSet.showIntroScreen??!0,showOutro=e.showOutroScreen??vSet.showOutroScreen??!0,showFun=e.showFunAwards??vSet.showFunAwards??!0,enKills=e.enableKillCounter??vSet.enableKillCounter??!0,enSlow=e.enableSlowMotion??vSet.enableSlowMotion??!0,enFast=e.enableFastForward??vSet.enableFastForward??!0,enTrans=e.enableSequenceTransitions??vSet.enableSequenceTransitions??!0;
  let targetFps=i,captureFps=enSlow?Math.max(targetFps*2,120):targetFps;
  let matchCtx=await fetchMatchIntroHudCtx(e.checksum);
  if(matchCtx){
    for(let seq of s){
      for(let cam of seq.playerCameras||[]){
        if(!cam.playerName&&cam.playerSteamId){
          let fp=matchCtx.players.find(p=>p.steamId===cam.playerSteamId);
          if(fp)cam.playerName=fp.name;
        }
        if(!cam.roundNumber){
          let tk=cam.tick||seq.startTick;
          let fr=matchCtx.rounds.find(rd=>tk>=rd.startTick-256&&tk<=rd.endTick+256);
          if(fr)cam.roundNumber=fr.number;
        }
      }
    }
  }
  let ffBin=Ks(u.customExecutableLocation)?await Bl():u.customExecutableLocation;
  let completedSeqs=[],lastErr;
  for(let[H,m]of s.entries()){
    d(m.number,H+1);
    try{
      let seqKills=(matchCtx?.kills??[]).filter(k=>k.tick>=m.startTick&&k.tick<=m.endTick);
      let seqClutches=(matchCtx?.clutches??[]).filter(cl=>seqKills.some(k=>k.roundNumber===cl.roundNumber&&k.killerSteamId===cl.clutcherSteamId));
      o===Bs.FFmpeg?await hIe({ffmpegExecutablePath:ffBin,recordingSystem:r,recordingOutput:n,game:A,recordAudio:m.recordAudio,audioBitrate:u.audioBitrate,constantRateFactor:u.constantRateFactor,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,inputParameters:u.inputParameters,outputParameters:u.outputParameters,framerate:captureFps,targetFramerate:targetFps,tickrate:e.tickrate,outputFolderPath:a,sequence:m,hudPosition:hudPos,enableSequenceTransitions:enTrans,enableKillCounter:enKills,enableSlowMotion:enSlow,enableFastForward:enFast,sequenceKills:seqKills,clutches:seqClutches},t):await AIe({recordingSystem:r,game:A,recordAudio:m.recordAudio,framerate:captureFps,outputFolderPath:a,sequence:m},t);
      completedSeqs.push(m);
    }catch(err){
      if(t.aborted)throw err;
      logger.error(`Failed to convert sequence ${m.number}`,err);
      lastErr=err;
    }
  }
  if(completedSeqs.length===0&&lastErr)throw lastErr;
  let isLowlightVideo=Boolean(e.isLowlight)||s.some(seq=>seq.isLowlight);
  let introVideoPath,outroVideoPath;
  if(showIntro&&o===Bs.FFmpeg&&completedSeqs.length>0&&matchCtx){
    try{
      introVideoPath=await generateIntroVideoWithFFmpeg({ffmpegExecutablePath:ffBin,game:A,mapName:matchCtx.mapName||e.mapName,matchDate:matchCtx.matchDate,teamAName:matchCtx.teamAName,teamAScore:matchCtx.teamAScore,teamBName:matchCtx.teamBName,teamBScore:matchCtx.teamBScore,players:matchCtx.players,width:e.width,height:e.height,framerate:targetFps,outputFolderPath:a,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,constantRateFactor:u.constantRateFactor,audioBitrate:u.audioBitrate,outputParameters:u.outputParameters,isLowlight:isLowlightVideo},t);
    }catch(err){
      logger.error("Failed to generate 8s intro video, continuing with sequences",err);
    }
  }
  if(showOutro&&o===Bs.FFmpeg&&completedSeqs.length>0&&matchCtx){
    try{
      outroVideoPath=await generateOutroVideoWithFFmpeg({ffmpegExecutablePath:ffBin,game:A,mapName:matchCtx.mapName||e.mapName,teamAName:matchCtx.teamAName,teamAScore:matchCtx.teamAScore,teamBName:matchCtx.teamBName,teamBScore:matchCtx.teamBScore,mvp:matchCtx.mvp,highlights:matchCtx.highlights,showFunAwards:showFun,funAwards:matchCtx.funAwards,width:e.width,height:e.height,framerate:targetFps,outputFolderPath:a,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,constantRateFactor:u.constantRateFactor,audioBitrate:u.audioBitrate,outputParameters:u.outputParameters,isLowlight:isLowlightVideo,lowlightsCtx:matchCtx.lowlightsCtx},t);
    }catch(err){
      logger.error("Failed to generate outro video, continuing with sequences",err);
    }
  }
  if((c||Boolean(introVideoPath)||Boolean(outroVideoPath))&&completedSeqs.length>0){
    f();
    let H=T_e(l,{mapName:e.mapName,checksum:e.checksum,game:e.game,encoderSoftware:e.encoderSoftware,width:e.width,height:e.height,framerate:e.framerate,matchDate:matchCtx?.matchDate||e.matchDate});
    await mIe({ffmpegExecutablePath:ffBin,outputFolderPath:a,sequences:completedSeqs,videoContainer:u.videoContainer,fileName:H,introVideoPath,outroVideoPath},t);
  }
}