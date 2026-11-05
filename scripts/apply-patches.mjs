import fs from 'node:fs';
import path from 'node:path';

const appExtractedDir = 'C:/Users/FernandoPC/.gemini/antigravity/scratch/cs-demo-manager-custom/app-extracted';
const backupsDir = 'C:/Users/FernandoPC/.gemini/antigravity/scratch/cs-demo-manager-custom/backups';
const serverJsPath = path.join(appExtractedDir, 'server.js');
const uiJsPath = path.join(appExtractedDir, 'assets/index-CaMMgvc3.js');
const serverBakPath = path.join(backupsDir, 'server.js.orig.bak');
const uiBakPath = path.join(backupsDir, 'index-CaMMgvc3.js.orig.bak');

fs.mkdirSync(backupsDir, { recursive: true });
if (!fs.existsSync(serverBakPath)) {
  fs.copyFileSync(serverJsPath, serverBakPath);
}
if (!fs.existsSync(uiBakPath)) {
  fs.copyFileSync(uiJsPath, uiBakPath);
}

let serverJs = fs.readFileSync(serverBakPath, 'utf8');
let uiJs = fs.readFileSync(uiBakPath, 'utf8');

function replaceExact(content, target, replacement, label) {
  const idx = content.indexOf(target);
  if (idx === -1) {
    throw new Error(`Target not found for: ${label}`);
  }
  return content.slice(0, idx) + replacement + content.slice(idx + target.length);
}

// 0. Patch default video settings in server.js
serverJs = replaceExact(
  serverJs,
  `video:{recordingSystem:Br.CounterStrike,recordingOutput:Pr.Video,closeGameAfterRecording:!0,concatenateSequences:!1,`,
  `video:{recordingSystem:Br.CounterStrike,recordingOutput:Pr.Video,closeGameAfterRecording:!0,concatenateSequences:!1,hideGameWindow:!0,hudPosition:"top-left",showIntroScreen:!0,showOutroScreen:!0,showFunAwards:!0,enableKillCounter:!0,enableSlowMotion:!0,enableSequenceTransitions:!0,`,
  'default video settings in server.js',
);

// 1. Patch createCsgoVideoJsonFile (gT) in server.js
const oldCsgoFn = `async function gT({type:t,recordingSystem:e,recordingOutput:r,encoderSoftware:n,outputFolderPath:o,framerate:i,demoPath:s,sequences:a,closeGameAfterRecording:c,tickrate:l,ffmpegSettings:u}){let A=new Po(s,y.Game.CSGO),d=["sv_cheats 1","volume 1","net_graph 0","host_timescale 0","mirv_snd_timescale 1","mirv_gameoverlay enable 0"],f=Math.min(l,128);for(let h=0;h<a.length;h++){let H=a[h];for(let b of d)A.addExecCommand(f,b);A.addExecCommand(f,\`cl_draw_only_deathnotices \${H.showOnlyDeathNotices?1:0}\`),A.addExecCommand(f,\`mirv_deathmsg lifetime \${H.deathNoticesDuration}\`),A.addExecCommand(1,"mirv_deathmsg filter clear"),H.playerVoicesEnabled?A.enablePlayerVoices(f):A.disablePlayerVoices(f);let m=Math.round(l),g=H.startTick-m>0?H.startTick-m:1,E=qgt(o,H),_=r===Pr.Video&&n===Bs.FFmpeg?\`csdmPreset\${H.number}\`:"afxClassic";if(A.addExecCommand(g,\`mirv_streams record startMovieWav \${H.recordAudio?1:0}\`).addExecCommand(g,\`mirv_streams record name "\${E}"\`).addExecCommand(g,"mirv_replace_name filter clear").addExecCommand(g,\`spec_show_xray \${H.showXRay?1:0}\`).addExecCommand(g,\`mp_display_kill_assists \${H.showAssists?1:0}\`).addExecCommand(g,\`host_framerate \${i}\`),_!=="afxClassic"){let b=\`-c:v \${u.videoCodec}\`;u.outputParameters===""?b+=\` -crf \${u.constantRateFactor}\`:b+=\` \${u.outputParameters}\`,A.addExecCommand(g,\`mirv_streams settings add ffmpeg \${_} "\${b} {QUOTE}\${E}\\\\\\\\video.\${u.videoContainer}{QUOTE}"\`).addExecCommand(g,\`mirv_streams settings edit afxDefault settings \${_}\`)}if(typeof H.cfg=="string"){let b=H.cfg.split(\`
\`);for(let D of b)A.addExecCommand(g,D)}A.addGoToTick(f,g);for(let b of H.playerCameras)A.addSpecPlayer(b.tick,b.playerSteamId);A.addExecCommand(g,"mirv_deathmsg filter clear"),H.playersOptions.length>0&&A.addExecCommand(g,"mirv_deathmsg filter add block=1");for(let b of H.playersOptions){let D=zgt(b);A.addExecCommand(g,D),b.showKill&&A.addExecCommand(g,\`mirv_deathmsg filter add attackerMatch=x\${b.steamId} attackerIsLocal=\${b.highlightKill?"1":"0"} block=0\`)}t==="record"&&(e===Br.HLAE?A.addExecCommand(H.startTick,"mirv_streams add normal defaultNormal").addExecCommand(H.startTick,"mirv_streams record start").addExecCommand(H.endTick,"mirv_streams record end"):A.addExecCommand(H.startTick,\`startmovie \${On(H)}\`).addExecCommand(H.endTick,"endmovie")),c&&h===a.length-1?A.addExecCommand(Wn(a).endTick+1,"quit"):A.addGoToNextSequence(H.endTick+l)}await A.write()}`;

const newCsgoFn = `function buildFfmpegPresetParameters(u,is120Fps=!1){let c=u.videoCodec.trim(),cl=c.toLowerCase(),b=\`-y -c:v \${c}\`;if(u.outputParameters!==""){b+=\` \${u.outputParameters}\`}else if(cl.includes("nvenc")){b+=is120Fps?\` -preset p4 -tune hq -rc vbr -cq \${u.constantRateFactor} -b:v 20000k -maxrate 25000k -bufsize 40000k -pix_fmt yuv420p\`:\` -preset p4 -tune hq -rc vbr -cq \${u.constantRateFactor} -b:v 0 -pix_fmt yuv420p\`}else if(cl.includes("amf")){b+=is120Fps?\` -quality quality -rc cqp -qp_i \${u.constantRateFactor} -qp_p \${u.constantRateFactor} -b:v 20000k -maxrate 25000k -bufsize 40000k -pix_fmt yuv420p\`:\` -quality quality -rc cqp -qp_i \${u.constantRateFactor} -qp_p \${u.constantRateFactor} -pix_fmt yuv420p\`}else if(cl.includes("qsv")){b+=is120Fps?\` -preset medium -global_quality \${u.constantRateFactor} -b:v 20000k -maxrate 25000k -bufsize 40000k -pix_fmt yuv420p\`:\` -preset medium -global_quality \${u.constantRateFactor} -pix_fmt yuv420p\`}else if(cl.includes("mf")){let q=Math.max(1,Math.min(100,Math.round((51-u.constantRateFactor)*2)));b+=is120Fps?\` -rate_control quality -quality \${q} -b:v 20000k -maxrate 25000k -bufsize 40000k -pix_fmt yuv420p\`:\` -rate_control quality -quality \${q} -pix_fmt yuv420p\`}else{b+=is120Fps?\` -pix_fmt yuv420p -b:v 20000k -maxrate 25000k -bufsize 40000k -crf \${u.constantRateFactor}\`:\` -pix_fmt yuv420p -crf \${u.constantRateFactor}\`}return b}async function gT({type:t,recordingSystem:e,recordingOutput:r,encoderSoftware:n,outputFolderPath:o,framerate:i,demoPath:s,sequences:a,closeGameAfterRecording:c,tickrate:l,ffmpegSettings:u}){let A=new Po(s,y.Game.CSGO),d=["sv_cheats 1","volume 1","net_graph 0","fps_max 0","mat_queue_mode 2","engine_no_focus_sleep 0","host_timescale 0","mirv_snd_timescale 1","mirv_gameoverlay enable 0"],f=Math.min(l,128),m=Math.round(l);for(let b of d)A.addExecCommand(f,b);A.addExecCommand(1,"mirv_deathmsg filter clear");for(let h=0;h<a.length;h++){let H=a[h],prevEnd=h>0?a[h-1].endTick:0,g=Math.min(H.startTick-2,Math.max(prevEnd+4,H.startTick-m>0?H.startTick-m:1)),E=qgt(o,H),_=r===Pr.Video&&n===Bs.FFmpeg?\`csdmPreset\${H.number}\`:"afxClassic";A.addExecCommand(g,\`cl_draw_only_deathnotices \${H.showOnlyDeathNotices?1:0}\`),A.addExecCommand(g,\`mirv_deathmsg lifetime \${H.deathNoticesDuration}\`),H.playerVoicesEnabled?A.enablePlayerVoices(g):A.disablePlayerVoices(g);if(A.addExecCommand(g,\`mirv_streams record startMovieWav \${H.recordAudio?1:0}\`).addExecCommand(g,\`mirv_streams record name "\${E}"\`).addExecCommand(g,"mirv_replace_name filter clear").addExecCommand(g,\`spec_show_xray \${H.showXRay?1:0}\`).addExecCommand(g,\`mp_display_kill_assists \${H.showAssists?1:0}\`).addExecCommand(g,\`host_framerate \${i}\`),_!=="afxClassic"){let b=buildFfmpegPresetParameters(u,i>=100);A.addExecCommand(g,\`mirv_streams settings add ffmpeg \${_} "\${b} {QUOTE}\${E}\\\\\\\\video.\${u.videoContainer}{QUOTE}"\`).addExecCommand(g,\`mirv_streams settings edit afxDefault settings \${_}\`)}if(typeof H.cfg=="string"){let b=H.cfg.split(\`
\`);for(let D of b)A.addExecCommand(g,D)}h===0&&g-4>f&&A.addGoToTick(f,g-4);for(let b of H.playerCameras)A.addSpecPlayer(b.tick,b.playerSteamId);A.addExecCommand(g,"mirv_deathmsg filter clear"),H.playersOptions.length>0&&A.addExecCommand(g,"mirv_deathmsg filter add block=1");for(let b of H.playersOptions){let D=zgt(b);A.addExecCommand(g,D),b.showKill&&A.addExecCommand(g,\`mirv_deathmsg filter add attackerMatch=x\${b.steamId} attackerIsLocal=\${b.highlightKill?"1":"0"} block=0\`)}t==="record"&&(e===Br.HLAE?A.addExecCommand(H.startTick,"mirv_streams add normal defaultNormal").addExecCommand(H.startTick,"mirv_streams record start").addExecCommand(H.endTick,"mirv_streams record end"):A.addExecCommand(H.startTick,\`startmovie \${On(H)}\`).addExecCommand(H.endTick,"endmovie"));if(h<a.length-1){let nextG=Math.max(H.endTick+4,a[h+1].startTick-m>0?a[h+1].startTick-m:1);nextG-4>H.endTick+4&&A.addGoToTick(H.endTick+2,nextG-4)}else if(c){A.addExecCommand(H.endTick+16,"quit")}}await A.write()}`;

serverJs = replaceExact(serverJs, oldCsgoFn, newCsgoFn, 'createCsgoVideoJsonFile (gT)');

// 2. Patch createCs2VideoJsonFile (LT) in server.js
const oldCs2Fn = `async function LT({type:t,recordingSystem:e,recordingOutput:r,encoderSoftware:n,outputFolderPath:o,framerate:i,demoPath:s,sequences:a,closeGameAfterRecording:c,trueView:l,tickrate:u,players:A,cameras:d,ffmpegSettings:f}){let h=new Po(s,y.Game.CS2),H=["sv_cheats 1","volume 1","cl_hud_telemetry_frametime_show 0","cl_hud_telemetry_net_misdelivery_show 0","cl_hud_telemetry_ping_show 0","cl_hud_telemetry_serverrecvmargin_graph_show 0","cl_trueview_show_status 0","r_show_build_info 0","mirv_streams record screen enabled 1",\`cl_demo_predict \${l?1:0}\`];for(let m=0;m<a.length;m++){let g=a[m];for(let $ of H)h.addExecCommand(1,$);h.addExecCommand(1,\`cl_draw_only_deathnotices \${g.showOnlyDeathNotices?1:0}\`),h.addExecCommand(1,\`mirv_deathmsg lifetime \${g.deathNoticesDuration}\`),h.addExecCommand(1,"mirv_deathmsg filter clear"),g.playerVoicesEnabled?h.enablePlayerVoices(1):h.disablePlayerVoices(1);let E=Math.round(u),_=Math.max(1,g.startTick-E),b=fEt(o,g),D=r===Pr.Video&&n===Bs.FFmpeg?\`csdmPreset\${g.number}\`:"afxClassic";if(h.addExecCommand(_,\`mirv_streams record startMovieWav \${g.recordAudio?1:0}\`).addExecCommand(_,\`mirv_streams record name "\${b}"\`).addExecCommand(_,"mirv_deathmsg clear").addExecCommand(_,\`spec_show_xray \${g.showXRay?1:0}\`).addExecCommand(_,\`mp_display_kill_assists \${g.showAssists?1:0}\`),D!=="afxClassic"){let $=\`-c:v \${f.videoCodec} -pix_fmt yuv420p\`;f.outputParameters===""?$+=\` -crf \${f.constantRateFactor}\`:$+=\` \${f.outputParameters}\`,h.addExecCommand(_,\`mirv_streams settings add ffmpeg \${D} "\${$} {QUOTE}\${b}\\\\\\\\video.\${f.videoContainer}{QUOTE}"\`).addExecCommand(_,\`mirv_streams record screen settings \${D}\`)}if(e===Br.HLAE?h.addExecCommand(_,\`mirv_streams record fps \${i}\`):h.addExecCommand(_,\`host_framerate \${i}\`),typeof g.cfg=="string"){let $=g.cfg.split(\`
\`);for(let N of $)h.addExecCommand(_,N)}h.addPausePlayback(Math.max(1,g.startTick-4)),h.addGoToTick(1,Math.max(1,_-1));for(let $ of g.playerCameras){let N=A.find(U=>U.steamId===$.playerSteamId);N&&h.addSpecPlayer($.tick,N.slot)}for(let{id:$,tick:N}of g.cameras){let U=d.find(B=>$===B.id);U&&h.addFocusCamera(N,U)}h.addExecCommand(_,"mirv_deathmsg filter clear"),g.playersOptions.length>0&&h.addExecCommand(_,"mirv_deathmsg filter add block=1");for(let $ of g.playersOptions){let N=\`mirv_replace_name byXuid add x\${$.steamId} "\${$.playerName}"\`;if(h.addExecCommand(_,N),$.showKill&&h.addExecCommand(_,\`mirv_deathmsg filter add attackerMatch=x\${$.steamId} attackerIsLocal=\${$.highlightKill?"1":"0"} block=0\`),$.isVoiceEnabled){let U=g.playersOptions.filter(B=>B.isVoiceEnabled);if(U.length!==g.playersOptions.length){let B=[];for(let te of U){let R=A.find(L=>L.steamId===te.steamId);R&&B.push(R.userId)}let{valueLow:w,valueHigh:O}=mg(B);h.addExecCommand(_,\`tv_listen_voice_indices \${w}\`),h.addExecCommand(_,\`tv_listen_voice_indices_h \${O}\`)}}}t==="record"&&(e===Br.HLAE?h.addExecCommand(g.startTick,"mirv_streams record start").addExecCommand(g.endTick,"mirv_streams record end"):h.addExecCommand(g.startTick,\`startmovie \${On(g)}\`).addExecCommand(g.endTick,"endmovie")),c&&m===a.length-1?h.addExecCommand(Wn(a).endTick+64,"quit"):h.addGoToNextSequence(g.endTick+64)}await h.write()}`;

const newCs2Fn = `async function LT({type:t,recordingSystem:e,recordingOutput:r,encoderSoftware:n,outputFolderPath:o,framerate:i,demoPath:s,sequences:a,closeGameAfterRecording:c,trueView:l,tickrate:u,players:A,cameras:d,ffmpegSettings:f}){let h=new Po(s,y.Game.CS2),H=["sv_cheats 1","volume 1","fps_max 0","engine_no_focus_sleep 0","cl_hud_telemetry_frametime_show 0","cl_hud_telemetry_net_misdelivery_show 0","cl_hud_telemetry_ping_show 0","cl_hud_telemetry_serverrecvmargin_graph_show 0","cl_trueview_show_status 0","r_show_build_info 0","mirv_streams record screen enabled 1",\`cl_demo_predict \${l?1:0}\`],E=Math.round(u);for(let $ of H)h.addExecCommand(1,$);for(let m=0;m<a.length;m++){let g=a[m],prevEnd=m>0?a[m-1].endTick:0,_=Math.min(g.startTick-2,Math.max(prevEnd+4,g.startTick-E>0?g.startTick-E:1)),b=fEt(o,g),D=r===Pr.Video&&n===Bs.FFmpeg?\`csdmPreset\${g.number}\`:"afxClassic";h.addExecCommand(_,\`cl_draw_only_deathnotices \${g.showOnlyDeathNotices?1:0}\`),h.addExecCommand(_,\`mirv_deathmsg lifetime \${g.deathNoticesDuration}\`),h.addExecCommand(_,"mirv_deathmsg clear"),g.playerVoicesEnabled?h.enablePlayerVoices(_):h.disablePlayerVoices(_);if(h.addExecCommand(_,\`mirv_streams record startMovieWav \${g.recordAudio?1:0}\`).addExecCommand(_,\`mirv_streams record name "\${b}"\`).addExecCommand(_,"mirv_deathmsg clear").addExecCommand(_,\`spec_show_xray \${g.showXRay?1:0}\`).addExecCommand(_,\`mp_display_kill_assists \${g.showAssists?1:0}\`),D!=="afxClassic"){let $=buildFfmpegPresetParameters(f,i>=100);h.addExecCommand(_,\`mirv_streams settings add ffmpeg \${D} "\${$} {QUOTE}\${b}\\\\\\\\video.\${f.videoContainer}{QUOTE}"\`).addExecCommand(_,\`mirv_streams record screen settings \${D}\`)}if(e===Br.HLAE?h.addExecCommand(_,\`mirv_streams record fps \${i}\`):h.addExecCommand(_,\`host_framerate \${i}\`),typeof g.cfg=="string"){let $=g.cfg.split(\`
\`);for(let N of $)h.addExecCommand(_,N)}m===0&&(h.addPausePlayback(Math.max(1,g.startTick-4)),h.addGoToTick(1,Math.max(1,_-1)));for(let $ of g.playerCameras){let N=A.find(U=>U.steamId===$.playerSteamId);N&&h.addSpecPlayer($.tick,N.slot)}for(let{id:$,tick:N}of g.cameras){let U=d.find(B=>$===B.id);U&&h.addFocusCamera(N,U)}h.addExecCommand(_,"mirv_deathmsg filter clear"),g.playersOptions.length>0&&h.addExecCommand(_,"mirv_deathmsg filter add block=1");for(let $ of g.playersOptions){let N=\`mirv_replace_name byXuid add x\${$.steamId} "\${$.playerName}"\`;if(h.addExecCommand(_,N),$.showKill&&h.addExecCommand(_,\`mirv_deathmsg filter add attackerMatch=x\${$.steamId} attackerIsLocal=\${$.highlightKill?"1":"0"} block=0\`),$.isVoiceEnabled){let U=g.playersOptions.filter(B=>B.isVoiceEnabled);if(U.length!==g.playersOptions.length){let B=[];for(let te of U){let R=A.find(L=>L.steamId===te.steamId);R&&B.push(R.userId)}let{valueLow:w,valueHigh:O}=mg(B);h.addExecCommand(_,\`tv_listen_voice_indices \${w}\`),h.addExecCommand(_,\`tv_listen_voice_indices_h \${O}\`)}}}t==="record"&&(e===Br.HLAE?h.addExecCommand(g.startTick,"mirv_streams record start").addExecCommand(g.endTick,"mirv_streams record end"):h.addExecCommand(g.startTick,\`startmovie \${On(g)}\`).addExecCommand(g.endTick,"endmovie"));if(m<a.length-1){let nextG=Math.max(g.endTick+4,a[m+1].startTick-E>0?a[m+1].startTick-E:1);h.addPausePlayback(Math.max(1,a[m+1].startTick-4));nextG-1>g.endTick+4&&h.addGoToTick(g.endTick+2,Math.max(1,nextG-1))}else if(c){h.addExecCommand(g.endTick+64,"quit")}}await h.write()}`;

serverJs = replaceExact(serverJs, oldCs2Fn, newCs2Fn, 'createCs2VideoJsonFile (LT)');

// 2.5 Patch Q_e to pass capture framerate (120 FPS when slow motion enabled) to HLAE record commands
const oldQeCall = `if(d===y.Game.CSGO)await gT({type:"record",recordingSystem:n,recordingOutput:o,encoderSoftware:i,outputFolderPath:h,framerate:s,demoPath:a,sequences:E,closeGameAfterRecording:u,tickrate:A,ffmpegSettings:f});else{let N=await rc(e);await LT({type:"record",recordingSystem:n,recordingOutput:o,encoderSoftware:i,outputFolderPath:h,framerate:s,demoPath:a,sequences:E,closeGameAfterRecording:u,tickrate:A,players:N,cameras:D,ffmpegSettings:f,trueView:H})}`;
const newQeCall = `let capFpsQ=(t.enableSlowMotion??!0)?Math.max(s*2,120):s;if(d===y.Game.CSGO)await gT({type:"record",recordingSystem:n,recordingOutput:o,encoderSoftware:i,outputFolderPath:h,framerate:capFpsQ,demoPath:a,sequences:E,closeGameAfterRecording:u,tickrate:A,ffmpegSettings:f});else{let N=await rc(e);await LT({type:"record",recordingSystem:n,recordingOutput:o,encoderSoftware:i,outputFolderPath:h,framerate:capFpsQ,demoPath:a,sequences:E,closeGameAfterRecording:u,tickrate:A,players:N,cameras:D,ffmpegSettings:f,trueView:H})}`;
serverJs = replaceExact(serverJs, oldQeCall, newQeCall, 'capture framerate in Q_e');

// 3. Patch generateVideoWithFFmpeg (hIe) + generateIntroVideoWithFFmpeg + generateOutroVideoWithFFmpeg, concatenateVideosFromSequences (mIe), and buildVideos (Ayt) in server.js
const oldHieFull = `async function hIe(t,e){logger.debug("Generating video with FFmpeg"),logger.debug(t);let{tgaFiles:r,wavFilePath:n,videoFilePath:o}=await hT(t),{ffmpegExecutablePath:i,framerate:s,inputParameters:a,videoCodec:c,audioCodec:l,audioBitrate:u,constantRateFactor:A,outputParameters:d,recordingSystem:f,game:h,sequence:H,outputFolderPath:m,videoContainer:g,recordingOutput:E,recordAudio:_}=t;await pT.default.ensureDir(m);let b=fg(m,H,g);if(f===Br.HLAE&&E===Pr.Video){if(!o)throw logger.error("Video file path is null for HLAE video output"),new Xs;let w=["-y"];a!==""&&w.push(a),w.push(\`-i "\${o}"\`);let O=_&&n;if(O){let te=await Jgt(i,n,l,u,e);w.push(\`-i "\${te}"\`)}return w.push("-c copy","-map 0:v:0"),O&&w.push("-map 1:a:0"),w.push(\`"\${b}"\`),d!==""&&w.push(d),await hg(i,w,e)}let D,$=R_.default.dirname(r[0]);if(f===Br.HLAE)D=R_.default.join($,"%05d.tga");else{let w=On(H);D=R_.default.join($,h===y.Game.CSGO?\`\${w}%04d.tga\`:\`\${w}%08d.tga\`)}let N=["-y",\`-framerate \${s}\`];a!==""&&N.push(a),N.push(\`-i "\${D}"\`);let U=n?await pT.default.pathExists(n):!1,B=_&&U;B&&N.push(\`-i "\${n}"\`),N.push(\`-vcodec \${c}\`),B&&N.push(\`-acodec \${l}\`,\`-b:a \${u}K\`),d!==""?N.push(d):N.push("-pix_fmt yuv420p",\`-crf \${A}\`),N.push(\`"\${b}"\`),await hg(i,N,e)}`;

const newHieAndIntroFull = `function escFfPath(p){return p.replaceAll("\\\\","/").replaceAll(":","\\\\:").replaceAll("'","\\\\'")}
function writeCleanTxtSync(p,txt){let clean=String(txt??"").replace(/[\\r\\n]/g," ").trim().replaceAll("%","\\\\%");pT.default.writeFileSync(p,clean,{encoding:"utf8"})}
function getWinFonts(){
  let windir=process.env.WINDIR||"C:\\\\Windows",fdir=R_.default.join(windir,"Fonts");
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
  let args=[\`-c:v \${c}\`];
  if(d!==""){args.push(d);return args}
  let cl=c.toLowerCase();
  if(cl.includes("nvenc")){
    args.push("-preset p4","-tune hq","-rc vbr",\`-cq \${A}\`,is120Fps?"-b:v 20000k":"-b:v 0");
    if(is120Fps)args.push("-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else if(cl.includes("amf")){
    args.push("-quality quality","-rc cqp",\`-qp_i \${A}\`,\`-qp_p \${A}\`);
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else if(cl.includes("qsv")){
    args.push("-preset medium",\`-global_quality \${A}\`);
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else if(cl.includes("mf")){
    let q=Math.max(1,Math.min(100,Math.round((51-A)*2)));
    args.push("-rate_control quality",\`-quality \${q}\`);
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push("-pix_fmt yuv420p");
  }else{
    args.push("-pix_fmt yuv420p");
    if(is120Fps)args.push("-b:v 20000k","-maxrate 25000k","-bufsize 40000k");
    args.push(\`-crf \${A}\`);
  }
  return args;
}
function getKillBadge(n){
  let titles=["1K","2K • DOUBLE KILL","3K • TRIPLE KILL","4K • QUADRA KILL","5K • ACE!","6K • SUPER KILL","7K • MONSTER KILL","8K • ULTRA KILL","9K • UNSTOPPABLE","10K • GODLIKE ACE"];
  return n>=1&&n<=10?titles[n-1]:\`\${n}K • MULTI KILL\`;
}
function getWpBadge(k){
  let w=String(k.weaponName??"").toLowerCase();
  if(k.isSsgCollat)return" • COLLAT SCOUT";
  if(w.includes("taser")||w.includes("zeus"))return" • ZEUS";
  if(k.weaponType==="knife"||w.includes("knife")||w.includes("bayonet"))return" • FACA";
  if(k.isNoScope)return" • NO-SCOPE";
  if((k.penetratedObjects??0)>=2)return" • WALLBANG";
  if(k.isThroughSmoke)return" • SMOKE";
  return"";
}
async function generateIntroVideoWithFFmpeg(cfg,signal){
  let{ffmpegExecutablePath:i,game:h,mapName,matchDate,teamAName,teamAScore,teamBName,teamBScore,players,width,height,framerate:s,outputFolderPath:m,videoContainer:g,videoCodec:c,constantRateFactor:A,audioBitrate:u,outputParameters:d}=cfg;
  let INTRO_DUR=8;
  await pT.default.ensureDir(m);
  let introOut=R_.default.join(m,\`intro-0.\${g}\`),tmpDir=R_.default.join(m,".intro-tmp");
  await pT.default.ensureDir(tmpDir);
  try{
    let staticDir=Ki(),gFolder=h===y.Game.CSGO?"csgo":"cs2",cleanMap=(mapName||"unknown").toLowerCase();
    let mapCands=[
      R_.default.join(staticDir,"images","maps",gFolder,"thumbnails",\`\${cleanMap}.png\`),
      R_.default.join(staticDir,"images","maps","csgo","thumbnails",\`\${cleanMap}.png\`),
      R_.default.join(staticDir,"images","maps","cs2","thumbnails",\`\${cleanMap}.png\`),
      R_.default.join(staticDir,"images","maps","thumbnail_unknown.png")
    ];
    let mapImg="";
    for(let cand of mapCands){if(await pT.default.pathExists(cand)){mapImg=cand;break}}
    let{boldEsc,monoEsc}=getWinFonts();
    let w=Math.max(1280,width||1920),ht=Math.max(720,height||1080),sx=w/1920,sy=ht/1080,rx=v=>Math.round(v*sx),ry=v=>Math.round(v*sy);
    let dateStr="";
    if(matchDate){let dt=new Date(matchDate);if(!Number.isNaN(dt.getTime()))dateStr=\`\${String(dt.getDate()).padStart(2,"0")}/\${String(dt.getMonth()+1).padStart(2,"0")}/\${dt.getFullYear()}\`}
    let humanPlayers=(players||[]).filter(p=>{
      if(p.isBot)return!1;
      let sid=String(p.steamId??"");
      if(sid==="0"||(sid!==""&&sid.length<=5))return!1;
      if(/^bot\\b/i.test((p.name||"").trim()))return!1;
      return!0;
    });
    let sortKda=(a,b)=>b.killCount!==a.killCount?b.killCount-a.killCount:b.assistCount!==a.assistCount?b.assistCount-a.assistCount:a.deathCount-b.deathCount;
    let tAPlayers=humanPlayers.filter(p=>p.teamName===teamAName||p.teamName?.toLowerCase()===teamAName?.toLowerCase()).sort(sortKda).slice(0,10);
    let tBPlayers=humanPlayers.filter(p=>p.teamName===teamBName||p.teamName?.toLowerCase()===teamBName?.toLowerCase()).sort(sortKda).slice(0,10);
    let assigned=new Set([...tAPlayers.map(p=>p.steamId),...tBPlayers.map(p=>p.steamId)]);
    for(let p of humanPlayers){
      if(!assigned.has(p.steamId)){
        if(tAPlayers.length<=tBPlayers.length)tAPlayers.push(p);
        else tBPlayers.push(p);
      }
    }
    tAPlayers.sort(sortKda);
    tBPlayers.sort(sortKda);
    let fmtRow=(p,idx)=>{
      let nm=(p.name||"Jogador").replace(/[\\r\\n\\t]/g," ").trim().slice(0,17).padEnd(18," ");
      let k=String(p.killCount??0).padStart(3," "),dt=String(p.deathCount??0).padStart(3," "),as=String(p.assistCount??0).padStart(3," ");
      let kd=((p.killCount??0)/Math.max(1,p.deathCount??0)).toFixed(2).padStart(5," ");
      return\`\${String(idx+1).padStart(2,"0")}. \${nm} \${k} / \${dt} / \${as}  \${kd}\`;
    };
    let wTxt=(name,txt)=>{let fp=R_.default.join(tmpDir,name);writeCleanTxtSync(fp,txt);return escFfPath(fp)};
    let hdrTxt=dateStr?\`HIGHLIGHTS DA PARTIDA  •  MAPA: \${cleanMap.toUpperCase()}  •  \${dateStr}\`:\`HIGHLIGHTS DA PARTIDA  •  MAPA: \${cleanMap.toUpperCase()}\`;
    let scoreTxt=\`\${teamAName||"TIME A"}     \${teamAScore??0}   x   \${teamBScore??0}     \${teamBName||"TIME B"}\`;
    let plJog=n=>\`\${n} JOGADOR\${n===1?"":"ES"}\`;
    let tATitle=\`\${(teamAName||"TIME A").toUpperCase()} (\${plJog(tAPlayers.length)})\`;
    let tBTitle=\`\${(teamBName||"TIME B").toUpperCase()} (\${plJog(tBPlayers.length)})\`;
    let colsHdr="#   JOGADOR              K /   D /   A    K/D";
    let ftrTxt="CS DEMO MANAGER CUSTOM  •  KDA TOTAL DOS JOGADORES (INCLUINDO BOTS ASSUMIDOS)";
    let fHdr=wTxt("hdr.txt",hdrTxt),fScore=wTxt("score.txt",scoreTxt),fTaT=wTxt("ta_t.txt",tATitle),fTbT=wTxt("tb_t.txt",tBTitle),fCols=wTxt("cols.txt",colsHdr),fFtr=wTxt("ftr.txt",ftrTxt);
    let maxRows=Math.max(tAPlayers.length,tBPlayers.length,1),rowFs=maxRows>8?ry(20):ry(22),rowStep=maxRows>8?ry(36):ry(42),rowStartY=ry(486);
    let fp=[
      \`scale=\${w}:\${ht}:force_original_aspect_ratio=increase\`,
      \`crop=\${w}:\${ht}\`,
      "setsar=1:1",
      "gblur=sigma=18",
      "eq=brightness=-0.38:saturation=0.8",
      \`drawbox=x=\${rx(120)}:y=\${ry(48)}:w=\${rx(1680)}:h=\${ry(100)}:color=0x0d131fe0:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(145)}:w=\${rx(1680)}:h=\${ry(4)}:color=0xf59e0b@0.95:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(174)}:w=\${rx(1680)}:h=\${ry(148)}:color=0x111827e8:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(174)}:w=\${rx(1680)}:h=\${ry(148)}:color=0x374151@0.8:t=2\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(352)}:w=\${rx(815)}:h=\${ry(560)}:color=0x0f172ae0:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(352)}:w=\${rx(815)}:h=\${ry(56)}:color=0x1e3a8ae0:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(352)}:w=\${rx(815)}:h=\${ry(560)}:color=0x3b82f6@0.7:t=2\`,
      \`drawbox=x=\${rx(985)}:y=\${ry(352)}:w=\${rx(815)}:h=\${ry(560)}:color=0x0f172ae0:t=fill\`,
      \`drawbox=x=\${rx(985)}:y=\${ry(352)}:w=\${rx(815)}:h=\${ry(56)}:color=0x7c2d12e0:t=fill\`,
      \`drawbox=x=\${rx(985)}:y=\${ry(352)}:w=\${rx(815)}:h=\${ry(560)}:color=0xf97316@0.7:t=2\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fHdr}':fontsize=\${ry(36)}:fontcolor=0xfbbf24:x=(w-text_w)/2:y=\${ry(82)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fScore}':fontsize=\${ry(60)}:fontcolor=white:x=(w-text_w)/2:y=\${ry(222)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fTaT}':fontsize=\${ry(27)}:fontcolor=0x93c5fd:x=\${rx(150)}:y=\${ry(368)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fTbT}':fontsize=\${ry(27)}:fontcolor=0xfdba74:x=\${rx(1015)}:y=\${ry(368)}\`,
      \`drawtext=fontfile='\${monoEsc}':textfile='\${fCols}':fontsize=\${ry(21)}:fontcolor=0x9ca3af:x=\${rx(150)}:y=\${ry(432)}\`,
      \`drawtext=fontfile='\${monoEsc}':textfile='\${fCols}':fontsize=\${ry(21)}:fontcolor=0x9ca3af:x=\${rx(1015)}:y=\${ry(432)}\`,
      \`drawbox=x=\${rx(145)}:y=\${ry(464)}:w=\${rx(765)}:h=1:color=0x374151@0.9:t=fill\`,
      \`drawbox=x=\${rx(1010)}:y=\${ry(464)}:w=\${rx(765)}:h=1:color=0x374151@0.9:t=fill\`
    ];
    for(let idx=0;idx<tAPlayers.length;idx++){
      let rf=wTxt(\`ta_\${idx}.txt\`,fmtRow(tAPlayers[idx],idx)),yy=rowStartY+idx*rowStep,col=idx===0?"0xfef08a":"white";
      fp.push(\`drawtext=fontfile='\${monoEsc}':textfile='\${rf}':fontsize=\${rowFs}:fontcolor=\${col}:x=\${rx(150)}:y=\${yy}\`);
    }
    for(let idx=0;idx<tBPlayers.length;idx++){
      let rf=wTxt(\`tb_\${idx}.txt\`,fmtRow(tBPlayers[idx],idx)),yy=rowStartY+idx*rowStep,col=idx===0?"0xfef08a":"white";
      fp.push(\`drawtext=fontfile='\${monoEsc}':textfile='\${rf}':fontsize=\${rowFs}:fontcolor=\${col}:x=\${rx(1015)}:y=\${yy}\`);
    }
    fp.push(
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fFtr}':fontsize=\${ry(21)}:fontcolor=0x9ca3af:x=(w-text_w)/2:y=\${ry(965)}\`,
      \`fps=\${s}\`,
      \`loop=loop=\${s*INTRO_DUR}:size=1:start=0\`,
      \`trim=duration=\${INTRO_DUR}\`,
      "fade=t=in:st=0:d=0.6",
      \`fade=t=out:st=\${(INTRO_DUR-0.6).toFixed(1)}:d=0.6\`,
      "format=yuv420p"
    );
    let filterFile=R_.default.join(tmpDir,"intro_filter.txt");
    await pT.default.writeFile(filterFile,fp.join(","),"utf8");
    let args=["-y"];
    if(mapImg)args.push(\`-i "\${mapImg}"\`);else args.push(\`-f lavfi -i "color=c=0x111827:s=\${w}x\${ht}:r=\${s}"\`);
    args.push(
      '-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"',
      \`-filter_script:v "\${filterFile}"\`,
      ...getVidCodecArgs(c,A,d,!0),
      "-c:a aac",
      \`-b:a \${u}K\`,
      \`-t \${INTRO_DUR}\`,
      "-shortest",
      "-movflags +faststart",
      \`"\${introOut}"\`
    );
    await hg(i,args,signal);
    return introOut;
  }finally{
    await pT.default.remove(tmpDir).catch(()=>{});
  }
}
async function generateOutroVideoWithFFmpeg(cfg,signal){
  let{ffmpegExecutablePath:i,game:h,mapName,teamAName,teamAScore,teamBName,teamBScore,mvp,highlights,showFunAwards=!0,funAwards=[],width,height,framerate:s,outputFolderPath:m,videoContainer:g,videoCodec:c,constantRateFactor:A,audioBitrate:u,outputParameters:d}=cfg;
  let hasFun=Boolean(showFunAwards&&funAwards&&funAwards.length>0);
  let OUTRO_DUR=hasFun?7:5;
  await pT.default.ensureDir(m);
  let outroOut=R_.default.join(m,\`outro-0.\${g}\`),tmpDir=R_.default.join(m,".outro-tmp");
  await pT.default.ensureDir(tmpDir);
  try{
    let staticDir=Ki(),gFolder=h===y.Game.CSGO?"csgo":"cs2",cleanMap=(mapName||"unknown").toLowerCase();
    let mapCands=[
      R_.default.join(staticDir,"images","maps",gFolder,"thumbnails",\`\${cleanMap}.png\`),
      R_.default.join(staticDir,"images","maps","csgo","thumbnails",\`\${cleanMap}.png\`),
      R_.default.join(staticDir,"images","maps","cs2","thumbnails",\`\${cleanMap}.png\`),
      R_.default.join(staticDir,"images","maps","thumbnail_unknown.png")
    ];
    let mapImg="";
    for(let cand of mapCands){if(await pT.default.pathExists(cand)){mapImg=cand;break}}
    let{boldEsc,monoEsc,emojiEsc}=getWinFonts();
    let w=Math.max(1280,width||1920),ht=Math.max(720,height||1080),sx=w/1920,sy=ht/1080,rx=v=>Math.round(v*sx),ry=v=>Math.round(v*sy);
    let wTxt=(name,txt)=>{let fp=R_.default.join(tmpDir,name);writeCleanTxtSync(fp,txt);return escFfPath(fp)};
    let winBanner="";
    if(teamAScore>teamBScore)winBanner=\`VITORIA: \${(teamAName||"TIME A").toUpperCase()} (\${teamAScore} x \${teamBScore})  •  MAPA: \${cleanMap.toUpperCase()}\`;
    else if(teamBScore>teamAScore)winBanner=\`VITORIA: \${(teamBName||"TIME B").toUpperCase()} (\${teamBScore} x \${teamAScore})  •  MAPA: \${cleanMap.toUpperCase()}\`;
    else winBanner=\`EMPATE: \${(teamAName||"TIME A").toUpperCase()} \${teamAScore} x \${teamBScore} \${(teamBName||"TIME B").toUpperCase()}  •  MAPA: \${cleanMap.toUpperCase()}\`;
    let fBanner=wTxt("banner.txt",winBanner),fMvpT=wTxt("mvp_t.txt","MVP DA PARTIDA"),fMvpN=wTxt("mvp_n.txt",(mvp?.name||"Jogador").toUpperCase()),fMvpTm=wTxt("mvp_tm.txt",\`TIME: \${(mvp?.teamName||"EQUIPE").toUpperCase()}\`);
    let fMvpKda=wTxt("mvp_kda.txt",\`KDA: \${mvp?.killCount??0} / \${mvp?.deathCount??0} / \${mvp?.assistCount??0}  (K/D: \${mvp?.kd??"1.00"})\`);
    let fMvpHum=wTxt("mvp_hum.txt",\`• Kills em Jogadores Humanos: \${mvp?.humanKills??0}\`),fMvpBot=wTxt("mvp_bot.txt",\`• Kills em Bots Assumidos: \${mvp?.botKills??0}\`),fMvpHs=wTxt("mvp_hs.txt",\`• Taxa de Headshot: \${mvp?.hsRate??0}%\`);
    let destTitle=hasFun?"TROFEUS DA PARTIDA":"DESTAQUES DA PARTIDA";
    let fDestT=wTxt("dest_t.txt",destTitle),fFtr=wTxt("ftr.txt","CS DEMO MANAGER CUSTOM  •  OBRIGADO POR ASSISTIR!");
    let fp=[
      \`scale=\${w}:\${ht}:force_original_aspect_ratio=increase\`,
      \`crop=\${w}:\${ht}\`,
      "setsar=1:1",
      "gblur=sigma=18",
      "eq=brightness=-0.38:saturation=0.8",
      \`drawbox=x=\${rx(120)}:y=\${ry(48)}:w=\${rx(1680)}:h=\${ry(100)}:color=0x0d131fe0:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(145)}:w=\${rx(1680)}:h=\${ry(4)}:color=0xf59e0b@0.95:t=fill\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fBanner}':fontsize=\${ry(36)}:fontcolor=0xfbbf24:x=(w-text_w)/2:y=\${ry(82)}\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(180)}:w=\${rx(815)}:h=\${ry(735)}:color=0x0f172ae8:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(180)}:w=\${rx(815)}:h=\${ry(58)}:color=0x1e3a8ae0:t=fill\`,
      \`drawbox=x=\${rx(120)}:y=\${ry(180)}:w=\${rx(815)}:h=\${ry(735)}:color=0x3b82f6@0.7:t=2\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpT}':fontsize=\${ry(28)}:fontcolor=0xfbbf24:x=\${rx(160)}:y=\${ry(195)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpN}':fontsize=\${ry(42)}:fontcolor=0xfef08a:x=\${rx(160)}:y=\${ry(270)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpTm}':fontsize=\${ry(24)}:fontcolor=0x93c5fd:x=\${rx(160)}:y=\${ry(325)}\`,
      \`drawbox=x=\${rx(160)}:y=\${ry(370)}:w=\${rx(735)}:h=1:color=0x374151@0.9:t=fill\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpKda}':fontsize=\${ry(28)}:fontcolor=white:x=\${rx(160)}:y=\${ry(400)}\`,
      \`drawbox=x=\${rx(160)}:y=\${ry(455)}:w=\${rx(735)}:h=1:color=0x374151@0.9:t=fill\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpHum}':fontsize=\${ry(25)}:fontcolor=0xe2e8f0:x=\${rx(160)}:y=\${ry(490)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpBot}':fontsize=\${ry(25)}:fontcolor=0x94a3b8:x=\${rx(160)}:y=\${ry(550)}\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fMvpHs}':fontsize=\${ry(25)}:fontcolor=0xfbbf24:x=\${rx(160)}:y=\${ry(610)}\`,
      \`drawbox=x=\${rx(985)}:y=\${ry(180)}:w=\${rx(815)}:h=\${ry(735)}:color=0x0f172ae8:t=fill\`,
      \`drawbox=x=\${rx(985)}:y=\${ry(180)}:w=\${rx(815)}:h=\${ry(58)}:color=0x7c2d12e0:t=fill\`,
      \`drawbox=x=\${rx(985)}:y=\${ry(180)}:w=\${rx(815)}:h=\${ry(735)}:color=0xf97316@0.7:t=2\`,
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fDestT}':fontsize=\${ry(28)}:fontcolor=0xfbbf24:x=\${rx(1025)}:y=\${ry(195)}\`
    ];
    if(hasFun){
      if(funAwards.length<=5){
        for(let idx=0;idx<funAwards.length;idx++){
          let item=funAwards[idx],destY=ry(265)+idx*ry(115);
          let fTrophy=wTxt(\`fa_t_\${idx}.txt\`,\`\${item.trophy} - \${item.playerName}\`),fDesc=wTxt(\`fa_d_\${idx}.txt\`,item.desc);
          fp.push(
            \`drawtext=fontfile='\${emojiEsc}':textfile='\${fTrophy}':fontsize=\${ry(25)}:fontcolor=0xfdba74:x=\${rx(1025)}:y=\${destY}\`,
            \`drawtext=fontfile='\${monoEsc}':textfile='\${fDesc}':fontsize=\${ry(20)}:fontcolor=white:x=\${rx(1045)}:y=\${destY+ry(38)}\`
          );
          if(idx<funAwards.length-1)fp.push(\`drawbox=x=\${rx(1025)}:y=\${destY+ry(85)}:w=\${rx(735)}:h=1:color=0x374151@0.7:t=fill\`);
        }
      }else{
        for(let idx=0;idx<Math.min(10,funAwards.length);idx++){
          let item=funAwards[idx],col=Math.floor(idx/5),row=idx%5;
          let colX=col===0?rx(1015):rx(1410),rowY=ry(265)+row*ry(118);
          let fBadge=wTxt(\`fa_b_\${idx}.txt\`,item.badge),fName=wTxt(\`fa_n_\${idx}.txt\`,item.playerName),fDesc=wTxt(\`fa_d_\${idx}.txt\`,item.desc);
          fp.push(
            \`drawtext=fontfile='\${emojiEsc}':textfile='\${fBadge}':fontsize=\${ry(21)}:fontcolor=0xfdba74:x=\${colX}:y=\${rowY}\`,
            \`drawtext=fontfile='\${boldEsc}':textfile='\${fName}':fontsize=\${ry(20)}:fontcolor=0xfef08a:x=\${colX}:y=\${rowY+ry(30)}\`,
            \`drawtext=fontfile='\${monoEsc}':textfile='\${fDesc}':fontsize=\${ry(16)}:fontcolor=white:x=\${colX}:y=\${rowY+ry(58)}\`
          );
          if(row<4&&idx+1<funAwards.length)fp.push(\`drawbox=x=\${colX}:y=\${rowY+ry(98)}:w=\${rx(365)}:h=1:color=0x374151@0.5:t=fill\`);
        }
      }
    }else{
      let destY=ry(270),dItems=highlights&&highlights.length>0?highlights:[{label:"• MELHOR LANCE DA PARTIDA",value:"Nenhum lance registrado"},{label:"• MAIOR K/D RATIO",value:"N/A"},{label:"• MIRA DE OURO",value:"N/A"},{label:"• CLUTCHER DO JOGO",value:"Nenhum clutch registrado"}];
      for(let idx=0;idx<dItems.length;idx++){
        let it=dItems[idx],fLbl=wTxt(\`hl_lbl_\${idx}.txt\`,it.label),fVal=wTxt(\`hl_val_\${idx}.txt\`,it.value);
        fp.push(
          \`drawtext=fontfile='\${boldEsc}':textfile='\${fLbl}':fontsize=\${ry(26)}:fontcolor=0xfdba74:x=\${rx(1025)}:y=\${destY}\`,
          \`drawtext=fontfile='\${monoEsc}':textfile='\${fVal}':fontsize=\${ry(23)}:fontcolor=white:x=\${rx(1045)}:y=\${destY+ry(36)}\`
        );
        destY+=ry(96);
        if(idx<dItems.length-1)fp.push(\`drawbox=x=\${rx(1025)}:y=\${destY-ry(20)}:w=\${rx(735)}:h=1:color=0x374151@0.7:t=fill\`);
      }
    }
    fp.push(
      \`drawtext=fontfile='\${boldEsc}':textfile='\${fFtr}':fontsize=\${ry(22)}:fontcolor=0x9ca3af:x=(w-text_w)/2:y=\${ry(965)}\`,
      \`fps=\${s}\`,
      \`loop=loop=\${s*OUTRO_DUR}:size=1:start=0\`,
      \`trim=duration=\${OUTRO_DUR}\`,
      "fade=t=in:st=0:d=0.5",
      \`fade=t=out:st=\${(OUTRO_DUR-0.5).toFixed(1)}:d=0.5\`,
      "format=yuv420p"
    );
    let filterFile=R_.default.join(tmpDir,"outro_filter.txt");
    await pT.default.writeFile(filterFile,fp.join(","),"utf8");
    let args=["-y"];
    if(mapImg)args.push(\`-i "\${mapImg}"\`);else args.push(\`-f lavfi -i "color=c=0x111827:s=\${w}x\${ht}:r=\${s}"\`);
    args.push(
      '-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"',
      \`-filter_script:v "\${filterFile}"\`,
      ...getVidCodecArgs(c,A,d,!0),
      "-c:a aac",
      \`-b:a \${u}K\`,
      \`-t \${OUTRO_DUR}\`,
      "-shortest",
      "-movflags +faststart",
      \`"\${outroOut}"\`
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
  let{ffmpegExecutablePath:i,framerate:s,targetFramerate:tfInput,tickrate:tk=64,inputParameters:a,videoCodec:c,audioCodec:l,audioBitrate:u,constantRateFactor:A,outputParameters:d,recordingSystem:f,game:h,sequence:H,outputFolderPath:m,videoContainer:g,recordingOutput:E,recordAudio:_,hudPosition:hudPos="top-left",enableSequenceTransitions:enTrans=!0,enableKillCounter:enKills=!0,enableSlowMotion:enSlow=!0,sequenceKills:seqKills=[],clutches:seqClutches=[]}=t;
  let tfps=tfInput||Math.min(s,60);
  await pT.default.ensureDir(m);
  let b=fg(m,H,g),tmpHudDir=R_.default.join(m,\`.hud-tmp-\${H.number}\`);
  let rawSeqDur=Math.max(0.5,(H.endTick-H.startTick)/Math.max(1,tk));
  let sortedCams=Array.isArray(H.playerCameras)?[...H.playerCameras].sort((x,y)=>x.tick-y.tick):[];
  let kills=Array.isArray(seqKills)?[...seqKills].sort((x,y)=>x.tick-y.tick):[];
  let slowMo=null;
  if(enSlow&&kills.length>0){
    let best=null,bSc=-1;
    for(let k of kills){
      let isClutch=seqClutches.some(cl=>cl.won&&cl.roundNumber===k.roundNumber&&cl.clutcherSteamId===k.killerSteamId);
      let wName=String(k.weaponName??"").toLowerCase();
      let sc=0;
      if(k.isNoScope)sc+=50;
      if(k.isSsgCollat)sc+=55;
      if(k.weaponType==="knife"||wName.includes("knife")||wName.includes("bayonet"))sc+=60;
      if(wName.includes("taser")||wName.includes("zeus"))sc+=60;
      if((k.penetratedObjects??0)>=2)sc+=40;
      if(isClutch&&(seqClutches.find(cl=>cl.roundNumber===k.roundNumber)?.opponentCount??0)>=2)sc+=45;
      if(sc>bSc){bSc=sc;best=k}
    }
    if(best&&bSc>0){
      let kSec=(best.tick-H.startTick)/Math.max(1,tk),sSt=Math.max(0.2,kSec-0.5),sEn=Math.min(rawSeqDur-0.2,kSec+1);
      if(sEn-sSt>=0.8)slowMo={startSec:sSt,endSec:sEn,extraSec:sEn-sSt,tick:best.tick};
    }
  }
  let hasSlow=Boolean(slowMo),isHighFps=(s>=100||tfps>=100||hasSlow),extraDur=slowMo?.extraSec??0,seqDur=rawSeqDur+extraDur;
  let fadeDur=Math.min(0.35,seqDur/4),fadeOutSt=Math.max(0,seqDur-fadeDur);
  let adjT=t0=>{if(!slowMo)return t0;if(t0<=slowMo.startSec)return t0;if(t0<=slowMo.endSec)return slowMo.startSec+(t0-slowMo.startSec)*2;return t0+slowMo.extraSec};
  let buildHud=async()=>{
    await pT.default.ensureDir(tmpHudDir);
    let{boldEsc}=getWinFonts(),hudVf=[],itIdx=0;
    if(hudPos&&hudPos!=="none"&&sortedCams.length>0){
      for(let idx=0;idx<sortedCams.length;idx++){
        let cam=sortedCams[idx],pName=(cam.playerName||"").trim();
        if(!pName)continue;
        let rNum=cam.roundNumber??H.roundNumber,basePov=rNum?\`POV: \${pName} - Round \${rNum}\`:\`POV: \${pName}\`;
        let camStartTick=idx===0?H.startTick:cam.tick,camEndTick=idx<sortedCams.length-1?sortedCams[idx+1].tick:H.endTick;
        let cStRaw=Math.max(0,(camStartTick-H.startTick)/Math.max(1,tk));
        let cEnRaw=idx<sortedCams.length-1?Math.max(cStRaw+0.1,(camEndTick-H.startTick)/Math.max(1,tk)):rawSeqDur+30;
        let cKills=kills.filter(k=>k.killerSteamId===cam.playerSteamId&&k.tick>=camStartTick&&k.tick<camEndTick+64);
        let intervals=[];
        if(!enKills||cKills.length===0){
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
              if(wc)badge+=\` [CLUTCH 1v\${wc.opponentCount} VENCIDO]\`;
            }
            let bColor="0x3b82f688",bWidth=2;
            if(kCount===2||kCount===3){bColor="0xf59e0bcc";bWidth=3}else if(kCount>=4){bColor="0xef4444cc";bWidth=3}
            intervals.push({rawStart:kStSec,rawEnd:kEnSec,text:\`\${basePov}  |  \${badge}\`,borderColor:bColor,borderWidth:bWidth});
          }
        }
        for(let it of intervals){
          let adjSt=adjT(it.rawStart),adjEn=adjT(it.rawEnd);
          let lblFile=R_.default.join(tmpHudDir,\`hud_\${itIdx++}.txt\`);
          writeCleanTxtSync(lblFile,it.text);
          let escLbl=escFfPath(lblFile);
          let enExpr=\`:enable='between(t,\${adjSt.toFixed(2)},\${adjEn.toFixed(2)})'\`;
          let boxW=Math.max(360,Math.min(1080,Math.round(it.text.length*13.5+56))),boxH=54,boxX="36",boxY="36",txtX="58",txtY="51";
          if(hudPos==="bottom-left"){boxX="36";boxY=\`ih-\${boxH+36}\`;txtX="58";txtY=\`h-\${boxH+21}\`}
          else if(hudPos==="bottom-right"){boxX=\`iw-\${boxW}-36\`;boxY=\`ih-\${boxH+36}\`;txtX=\`w-\${boxW}-14\`;txtY=\`h-\${boxH+21}\`}
          else if(hudPos==="top-center"){boxX=\`(iw-\${boxW})/2\`;boxY="36";txtX=\`(w-\${boxW})/2+22\`;txtY="51"}
          else if(hudPos==="top-right"){boxX=\`iw-\${boxW}-36\`;boxY="36";txtX=\`w-\${boxW}-14\`;txtY="51"}
          hudVf.push(
            \`drawbox=x=\${boxX}:y=\${boxY}:w=\${boxW}:h=\${boxH}:color=0x0d131fcc:t=fill\${enExpr}\`,
            \`drawbox=x=\${boxX}:y=\${boxY}:w=\${boxW}:h=\${boxH}:color=\${it.borderColor}:t=\${it.borderWidth}\${enExpr}\`,
            \`drawbox=x=\${boxX}:y=\${boxY}:w=6:h=\${boxH}:color=0xf59e0b@1.0:t=fill\${enExpr}\`,
            \`drawtext=fontfile='\${boldEsc}':textfile='\${escLbl}':fontsize=23:fontcolor=white:shadowcolor=black@0.85:shadowx=2:shadowy=2:x=\${txtX}:y=\${txtY}\${enExpr}\`
          );
        }
      }
    }
    return hudVf;
  };
  try{
    let hudVf=await buildHud();
    if(hasSlow&&slowMo){
      let s1=slowMo.startSec.toFixed(3),s2=slowMo.endSec.toFixed(3);
      let slowPtsExpr=(s>=100)?\`setpts=N/(\${tfps}*TB),fps=fps=\${tfps}:round=near\`:\`setpts=2.0*(PTS-STARTPTS),fps=fps=\${tfps}:round=near\`;
      let vBase=[
        \`[0:v]trim=start=0:end=\${s1},setpts=PTS-STARTPTS,fps=fps=\${tfps}:round=near[vpre]\`,
        \`[0:v]trim=start=\${s1}:end=\${s2},\${slowPtsExpr}[vslow]\`,
        \`[0:v]trim=start=\${s2},setpts=PTS-STARTPTS,fps=fps=\${tfps}:round=near[vpost]\`,
        \`[vpre][vslow][vpost]concat=n=3:v=1:a=0[vcat]\`
      ];
      let vOut=["setsar=1:1",...hudVf];
      if(enTrans)vOut.push(\`fade=t=in:st=0:d=\${fadeDur.toFixed(2)}\`,\`fade=t=out:st=\${fadeOutSt.toFixed(2)}:d=\${fadeDur.toFixed(2)}\`);
      vOut.push(\`fps=fps=\${tfps}:round=near\`,"format=yuv420p");
      let aBase=[
        \`[1:a]atrim=start=0:end=\${s1},asetpts=PTS-STARTPTS[apre]\`,
        \`[1:a]atrim=start=\${s1}:end=\${s2},asetpts=PTS-STARTPTS,atempo=0.5[aslow]\`,
        \`[1:a]atrim=start=\${s2},asetpts=PTS-STARTPTS[apost]\`,
        \`[apre][aslow][apost]concat=n=3:v=0:a=1[acat]\`
      ];
      let aOut=["aresample=async=1:first_pts=0"];
      if(enTrans)aOut.push(\`afade=t=in:st=0:d=\${fadeDur.toFixed(2)}\`,\`afade=t=out:st=\${fadeOutSt.toFixed(2)}:d=\${fadeDur.toFixed(2)}\`);
      let fullComp=[...vBase,\`[vcat]\${vOut.join(",")}[vout]\`,...aBase,\`[acat]\${aOut.join(",")}[aout]\`].join(";\\n");
      let compPath=R_.default.join(tmpHudDir,\`filter_comp_\${H.number}.txt\`);
      await pT.default.writeFile(compPath,fullComp,"utf8");
      let w=["-y","-hwaccel auto"];
      a!==""&&w.push(a);
      let hasAud=Boolean(_&&n&&await pT.default.pathExists(n));
      if(f===Br.HLAE&&E===Pr.Video){
        if(!o)throw logger.error("Video file path is null for HLAE video output"),new Xs;
        w.push(\`-i "\${o}"\`);
      }else{
        let rawPattern,rawDir=R_.default.dirname(r[0]);
        if(f===Br.HLAE)rawPattern=R_.default.join(rawDir,"%05d.tga");else{let seqNm=On(H);rawPattern=R_.default.join(rawDir,h===y.Game.CSGO?\`\${seqNm}%04d.tga\`:\`\${seqNm}%08d.tga\`)}
        w.push(\`-framerate \${s}\`,\`-i "\${rawPattern}"\`);
      }
      if(hasAud&&n)w.push(\`-i "\${n}"\`);else w.push('-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"');
      w.push(\`-filter_complex_script "\${compPath}"\`,'-map "[vout]"','-map "[aout]"',...getVidCodecArgs(c,A,d,isHighFps),"-c:a aac",\`-b:a \${u}K\`,"-shortest","-movflags +faststart",\`"\${b}"\`);
      return await hg(i,w,e);
    }
    let vf=["setsar=1:1",...hudVf];
    if(enTrans)vf.push(\`fade=t=in:st=0:d=\${fadeDur.toFixed(2)}\`,\`fade=t=out:st=\${fadeOutSt.toFixed(2)}:d=\${fadeDur.toFixed(2)}\`);
    vf.push(\`fps=fps=\${tfps}:round=near\`,"format=yuv420p");
    let fScript=R_.default.join(tmpHudDir,\`filter_seq_\${H.number}.txt\`);
    await pT.default.writeFile(fScript,vf.join(","),"utf8");
    let afFilter=enTrans?\`aresample=async=1:first_pts=0,afade=t=in:st=0:d=\${fadeDur.toFixed(2)},afade=t=out:st=\${fadeOutSt.toFixed(2)}:d=\${fadeDur.toFixed(2)}\`:"aresample=async=1:first_pts=0";
    if(f===Br.HLAE&&E===Pr.Video){
      if(!o)throw logger.error("Video file path is null for HLAE video output"),new Xs;
      let w=["-y","-hwaccel auto"];
      a!==""&&w.push(a);
      w.push(\`-i "\${o}"\`);
      let O=Boolean(_&&n&&await pT.default.pathExists(n));
      if(O){
        if(g==="mp4"||l.toLowerCase().includes("aac")){
          w.push(\`-i "\${n}"\`,"-map 0:v:0","-map 1:a:0",\`-filter_script:v "\${fScript}"\`,...getVidCodecArgs(c,A,d,isHighFps),"-c:a aac",\`-b:a \${u}K\`,\`-af "\${afFilter}"\`,"-shortest","-movflags +faststart");
        }else{
          let te=await Jgt(i,n,l,u,e);
          w.push(\`-i "\${te}"\`,"-map 0:v:0","-map 1:a:0",\`-filter_script:v "\${fScript}"\`,...getVidCodecArgs(c,A,d,isHighFps),"-c:a copy","-shortest");
        }
      }else{
        w.push('-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"',"-map 0:v:0","-map 1:a:0",\`-filter_script:v "\${fScript}"\`,...getVidCodecArgs(c,A,d,isHighFps),"-c:a aac",\`-b:a \${u}K\`,"-shortest","-movflags +faststart");
      }
      w.push(\`"\${b}"\`);
      return await hg(i,w,e);
    }
    let D,$=R_.default.dirname(r[0]);
    if(f===Br.HLAE)D=R_.default.join($,"%05d.tga");else{let w=On(H);D=R_.default.join($,h===y.Game.CSGO?\`\${w}%04d.tga\`:\`\${w}%08d.tga\`)}
    let N=["-y","-hwaccel auto",\`-framerate \${s}\`];
    a!==""&&N.push(a);
    N.push(\`-i "\${D}"\`);
    let U=n?await pT.default.pathExists(n):!1,B=_&&U;
    B&&N.push(\`-i "\${n}"\`);
    N.push(\`-filter_script:v "\${fScript}"\`,...getVidCodecArgs(c,A,d,isHighFps));
    B&&N.push(\`-acodec \${l}\`,\`-b:a \${u}K\`,\`-af "\${afFilter}"\`);
    N.push(\`"\${b}"\`);
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
      let key=\`\${rnd}:\${sid}:\${k.tick}\`;
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
    let ssgCollat=pKills.filter(k=>{
      let rnd=k.round_number??k.roundNumber;
      return (ssgCollatMap.get(\`\${rnd}:\${sid}:\${k.tick}\`)??0)>=2;
    }).length;
    let hsPct=totalK>0?Math.round((hs/totalK)*100):0,wbPct=totalK>0?Math.round((wb/totalK)*100):0,snpPct=totalK>0?Math.round((snp/totalK)*100):0;
    return{player:p,sid,name:p.name||"Jogador",totalK,totalD,ast,wb,wbPct,hs,hsPct,smk,zeus,knf,snp,snpPct,ns,blnd,air,grn,bot,trd,clCount,blndDeaths,ssgCollat};
  });
  let pool=[];
  for(let s of playerStats){
    let cands=[];
    if(s.wb>=1){
      let sc=s.wbPct>=20?110+s.wb*10:70+s.wb*8;
      let d=cleanMap.includes("dust")?\`\${s.wb} kill(s) varando a porta da Dust II\`:\`\${s.wb} kill(s) varando portas e paredes\`;
      cands.push({id:"porta_esperanca",badge:"Porta da Esperanca 🚪",title:"Trofeu Porta da Esperanca 🚪",desc:d,score:sc});
    }
    if(s.zeus>=1)cands.push({id:"pikachu",badge:"Pikachu ⚡",title:"Trofeu Pikachu ⚡",desc:\`\${s.zeus} choque(s) de alta voltagem no Zeus\`,score:120+s.zeus*20});
    if(s.knf>=1)cands.push({id:"traira",badge:"Traira 🐟",title:"Trofeu Traira 🐟",desc:\`\${s.knf} facada(s) traira pelas costas\`,score:115+s.knf*15});
    if(s.smk>=1)cands.push({id:"bob_marley",badge:"Bob Marley 💨",title:"Trofeu Bob Marley 💨",desc:\`\${s.smk} kill(s) na pura brisa dentro da smoke\`,score:95+s.smk*15});
    if(s.hs>=2&&s.hsPct>=35)cands.push({id:"cearense_lover",badge:"Cearense Lover 🤕",title:"Trofeu Cearense Lover 🤕",desc:\`So na cabecinha: \${s.hsPct}% HS (\${s.hs} tiros no coco)\`,score:s.hsPct*1.2+s.hs*2});
    if(s.snp>=3&&s.snpPct>=35)cands.push({id:"handicap",badge:"Handicap 💺",title:"Trofeu Handicap 💺",desc:\`So mata sentadinho: \${s.snp} kills de AWP/Sniper\`,score:80+s.snp*4});
    if(s.blnd>=1)cands.push({id:"pombo_cego",badge:"Pombo Cego 🕊️",title:"Trofeu Pombo Cego 🕊️",desc:\`\${s.blnd} kill(s) no escuro total (100% cego)\`,score:90+s.blnd*12});
    if(s.air>=1)cands.push({id:"saci_perere",badge:"Saci Perere 🦘",title:"Trofeu Saci Perere 🦘",desc:\`\${s.air} kill(s) voando pelo mapa no ar\`,score:85+s.air*12});
    if(s.ssgCollat>=1)cands.push({id:"dois_coelhos",badge:"Dois Coelhos 🐇",title:"Trofeu Dois Coelhos 🐇",desc:\`2 em 1: collat com 1 tiro de Scout (\${s.ssgCollat}x)\`,score:130+s.ssgCollat*25});
    if(s.ns>=1)cands.push({id:"no_scope",badge:"Sem Mira 🎯",title:"Trofeu Sem Mira 🎯",desc:\`\${s.ns} no-scope(s) de sniper a queima-roupa\`,score:85+s.ns*10});
    if(s.grn>=1)cands.push({id:"churrasqueiro",badge:"Churrasqueiro 🔥",title:"Trofeu Churrasqueiro 🔥",desc:\`\${s.grn} assado(s) na molotov ou HE\`,score:80+s.grn*10});
    if(s.clCount>=1)cands.push({id:"clutcher",badge:"Clutcher de Aco 🦾",title:"Trofeu Clutcher de Aco 🦾",desc:\`Gelo no sangue: venceu \${s.clCount} clutch(es)\`,score:100+s.clCount*20});
    if(s.bot>=1)cands.push({id:"ladrao_bot",badge:"Ladrao de Bot 🤖",title:"Trofeu Ladrao de Bot 🤖",desc:\`Assumiu o bot e fez \${s.bot} kills marotas\`,score:75+s.bot*10});
    if(s.ast>=2)cands.push({id:"garcom",badge:"Garcom da Rodada 🍽️",title:"Trofeu Garcom da Rodada 🍽️",desc:\`Serviu \${s.ast} assistencias de bandeja pro time\`,score:50+s.ast*8});
    if(s.trd>=2)cands.push({id:"papador",badge:"Papador de Kill 🦹",title:"Trofeu Papador de Kill 🦹",desc:\`Aproveitou a deixa: \${s.trd} trade kills miadas\`,score:55+s.trd*6});
    if(s.totalK>=8)cands.push({id:"exterminador",badge:"O Exterminador 💀",title:"Trofeu O Exterminador 💀",desc:\`Maquina mortifera com \${s.totalK} abates\`,score:s.totalK*4});
    if(s.totalD<=8)cands.push({id:"sobrevivente",badge:"O Sobrevivente 🐢",title:"Trofeu O Sobrevivente 🐢",desc:\`Escondidinho na base: so \${s.totalD} mortes\`,score:(25-s.totalD)*3});
    if(s.totalD>=8)cands.push({id:"saco_pancadas",badge:"Saco de Pancadas 🥊",title:"Trofeu Saco de Pancadas 🥊",desc:\`Caiu de pe: tomou \${s.totalD} mortes com bravura\`,score:35+s.totalD*2});
    if(s.blndDeaths>=1)cands.push({id:"oculos_escuros",badge:"Oculos Escuros 🕶️",title:"Trofeu Oculos Escuros 🕶️",desc:\`Nao viu de onde veio: morreu cego \${s.blndDeaths}x\`,score:40+s.blndDeaths*8});
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
}`;

serverJs = replaceExact(serverJs, oldHieFull, newHieAndIntroFull, 'generateVideoWithFFmpeg + generateIntroVideoWithFFmpeg + generateOutroVideoWithFFmpeg (hIe)');

const oldConcatFn = `async function mIe({ffmpegExecutablePath:t,sequences:e,outputFolderPath:r,videoContainer:n,fileName:o},i){let a=HIe(e).map(u=>fg(r,u,n)),c=PX.default.join(jt(),"videos.txt");await VX.default.writeFile(c,a.map(u=>\`file '\${u}'\`).join(\`
\`),"utf8");let l=["-y","-f concat","-safe 0",\`-i "\${c}"\`,"-c copy",\`"\${PX.default.join(r,\`\${o}.\${n}\`)}"\`];await hg(t,l,i),await Promise.all(a.map(u=>VX.default.remove(u)))}`;
const newConcatFn = `async function mIe({ffmpegExecutablePath:t,sequences:e,outputFolderPath:r,videoContainer:n,fileName:o,introVideoPath:introPath,outroVideoPath:outroPath},i){let allPaths=[];if(introPath){allPaths.push(introPath)}else{let defIntro=PX.default.join(r,\`intro-0.\${n}\`);if(await VX.default.pathExists(defIntro))allPaths.push(defIntro)}for(let u of HIe(e))allPaths.push(fg(r,u,n));if(outroPath){allPaths.push(outroPath)}else{let defOutro=PX.default.join(r,\`outro-0.\${n}\`);if(await VX.default.pathExists(defOutro))allPaths.push(defOutro)}let a=[];for(let p of allPaths){if(await VX.default.pathExists(p))a.push(p)}if(a.length===0)return;let outFile=PX.default.join(r,\`\${o}.\${n}\`);if(a.length===1){await VX.default.move(a[0],outFile,{overwrite:!0});return}let c=PX.default.join(r,"videos.txt");await VX.default.writeFile(c,a.map(u=>\`file '\${u.replaceAll("\\\\","/").replaceAll("'","'\\\\''")}'\`).join(\`
\`),"utf8");try{let l=n==="mp4"?["-y","-fflags +genpts","-f concat","-safe 0",\`-i "\${c}"\`,"-c:v copy","-c:a aac","-b:a 256K","-af aresample=async=1:first_pts=0","-movflags +faststart",\`"\${outFile}"\`]:["-y","-fflags +genpts","-f concat","-safe 0",\`-i "\${c}"\`,"-c copy",\`"\${outFile}"\`];await hg(t,l,i)}catch{let l=["-y","-fflags +genpts","-f concat","-safe 0",\`-i "\${c}"\`,"-c copy",\`"\${outFile}"\`];await hg(t,l,i)}finally{await VX.default.remove(c)}await Promise.all(a.map(u=>VX.default.remove(u)))}`;

serverJs = replaceExact(serverJs, oldConcatFn, newConcatFn, 'concatenateVideosFromSequences (mIe)');

// insertMatch reconcile omitted

const oldBuildVideosFn = `async function Ayt({signal:t,...e}){yA(t);let{recordingSystem:r,recordingOutput:n,encoderSoftware:o,framerate:i,sequences:s,outputFolderPath:a,concatenateSequences:c,outputFileName:l,ffmpegSettings:u,game:A,onSequenceStart:d,onConcatenateSequencesStart:f}=e;for(let[H,m]of s.entries())d(m.number,H+1),o===Bs.FFmpeg?await hIe({ffmpegExecutablePath:Ks(u.customExecutableLocation)?await Bl():u.customExecutableLocation,recordingSystem:r,recordingOutput:n,game:A,recordAudio:m.recordAudio,audioBitrate:u.audioBitrate,constantRateFactor:u.constantRateFactor,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,inputParameters:u.inputParameters,outputParameters:u.outputParameters,framerate:i,outputFolderPath:a,sequence:m},t):await AIe({recordingSystem:r,game:A,recordAudio:m.recordAudio,framerate:i,outputFolderPath:a,sequence:m},t);if(c&&s.length>1){f();let H=T_e(l,{mapName:e.mapName,checksum:e.checksum,game:e.game,encoderSoftware:e.encoderSoftware,width:e.width,height:e.height,framerate:e.framerate});await mIe({ffmpegExecutablePath:Ks(u.customExecutableLocation)?await Bl():u.customExecutableLocation,outputFolderPath:a,sequences:s,videoContainer:u.videoContainer,fileName:H},t)}}`;

const newBuildVideosFn = `async function reconcileMatchPlayerTeams(checksum){
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
    let[demoRow,teamRows,playerRows,roundRows,killRows,clutchRows]=await Promise.all([
      I.selectFrom("demos").select(["date","map_name"]).where("checksum","=",checksum).executeTakeFirst(),
      I.selectFrom("teams").select(["name","score","letter"]).where("match_checksum","=",checksum).orderBy("letter","asc").execute(),
      I.selectFrom("players").select(["steam_id","name","team_name","kill_count","death_count","assist_count"]).where("match_checksum","=",checksum).execute(),
      I.selectFrom("rounds").select(["number","start_tick","end_tick"]).where("match_checksum","=",checksum).orderBy("number","asc").execute(),
      I.selectFrom("kills").select(["id","tick","round_number","killer_steam_id","killer_name","killer_team_name","victim_steam_id","victim_name","victim_team_name","assister_steam_id","assister_team_name","weapon_name","weapon_type","is_headshot","is_no_scope","is_through_smoke","penetrated_objects","is_killer_controlling_bot","is_killer_airborne","is_killer_blinded","is_victim_blinded","is_trade_kill"]).where("match_checksum","=",checksum).orderBy("tick","asc").execute(),
      I.selectFrom("clutches").select(["round_number","tick","clutcher_steam_id","clutcher_name","opponent_count","won"]).where("match_checksum","=",checksum).execute().catch(()=>[])
    ]);
    let kMap=new Map(),dMap=new Map(),aMap=new Map(),humKMap=new Map(),botKMap=new Map(),hsMap=new Map(),ssgCollatMap=new Map();
    for(let k of killRows){
      let kid=String(k.killer_steam_id??""),vid=String(k.victim_steam_id??""),aid=String(k.assister_steam_id??"");
      let kw=String(k.weapon_name??"").toLowerCase();
      if((kw.includes("ssg")||kw.includes("scout"))&&kid){
        let kKey=\`\${k.round_number}:\${kid}:\${k.tick}\`;
        ssgCollatMap.set(kKey,(ssgCollatMap.get(kKey)??0)+1);
      }
      if(kid&&kid!=="0"&&kid!==vid&&(!k.killer_team_name||!k.victim_team_name||k.killer_team_name!==k.victim_team_name)){
        kMap.set(kid,(kMap.get(kid)??0)+1);
        if(isHumanId(vid)&&!/^bot\\b/i.test(k.victim_name||""))humKMap.set(kid,(humKMap.get(kid)??0)+1);
        else botKMap.set(kid,(botKMap.get(kid)??0)+1);
        if(k.is_headshot)hsMap.set(kid,(hsMap.get(kid)??0)+1);
      }
      if(vid&&vid!=="0")dMap.set(vid,(dMap.get(vid)??0)+1);
      if(aid&&aid!=="0"&&(!k.assister_team_name||!k.victim_team_name||k.assister_team_name!==k.victim_team_name))aMap.set(aid,(aMap.get(aid)??0)+1);
    }
    let tA=teamRows.find(t=>t.letter==="A")||teamRows[0]||{name:"Team A",score:0},tB=teamRows.find(t=>t.letter==="B")||teamRows[1]||{name:"Team B",score:0};    let humanPlayersWithStats=playerRows.filter(p=>isHumanId(p.steam_id)&&!/^bot\\b/i.test(p.name||"")).map(p=>{
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
      {label:"• MELHOR JOGADOR (MVP)",value:\`\${topMvp.name} (\${topMvp.killCount} Kills, \${topMvp.kd} K/D)\`},
      {label:"• MAIOR K/D RATIO",value:topKdPlayer?\`\${topKdPlayer.name} - \${topKdPlayer.kd} K/D (\${topKdPlayer.killCount} Kills)\`:"N/A"},
      {label:"• MIRA DE OURO (HEADSHOT)",value:topHsPlayer?\`\${topHsPlayer.name} - \${topHsPlayer.hsRate}% Headshots (\${topHsPlayer.hsCount} HS)\`:"N/A"},
      {label:"• CLUTCHER DO JOGO",value:bestClutch?\`\${bestClutch.clutcher_name||"Jogador"} - Clutch 1v\${bestClutch.opponent_count} Vencido (Round \${bestClutch.round_number})\`:"Nenhum clutch vencido na partida"}
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
      kills:killRows.map(k=>({id:k.id,tick:Number(k.tick),roundNumber:Number(k.round_number),killerSteamId:k.killer_steam_id??void 0,killerName:k.killer_name??void 0,killerTeamName:k.killer_team_name??void 0,victimSteamId:k.victim_steam_id??void 0,victimName:k.victim_name??void 0,victimTeamName:k.victim_team_name??void 0,weaponName:k.weapon_name??void 0,weaponType:k.weapon_type??void 0,isHeadshot:Boolean(k.is_headshot),isNoScope:Boolean(k.is_no_scope),isThroughSmoke:Boolean(k.is_through_smoke),penetratedObjects:Number(k.penetrated_objects??0),isKillerControllingBot:Boolean(k.is_killer_controlling_bot),isSsgCollat:(ssgCollatMap.get(\`\${k.round_number}:\${k.killer_steam_id}:\${k.tick}\`)??0)>=2})),
      clutches:(clutchRows||[]).map(c=>({roundNumber:Number(c.round_number),tick:Number(c.tick??0),clutcherSteamId:c.clutcher_steam_id??void 0,clutcherName:c.clutcher_name??void 0,opponentCount:Number(c.opponent_count??1),won:Boolean(c.won)})),
      mvp:topMvp,
      highlights:outroHighlights,
      funAwards:computeFunPlayerAwards(humanPlayersWithStats,killRows,clutchRows,demoRow?.map_name)
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
  let hudPos=e.hudPosition??vSet.hudPosition??"top-left",showIntro=e.showIntroScreen??vSet.showIntroScreen??!0,showOutro=e.showOutroScreen??vSet.showOutroScreen??!0,showFun=e.showFunAwards??vSet.showFunAwards??!0,enKills=e.enableKillCounter??vSet.enableKillCounter??!0,enSlow=e.enableSlowMotion??vSet.enableSlowMotion??!0,enTrans=e.enableSequenceTransitions??vSet.enableSequenceTransitions??!0;
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
      o===Bs.FFmpeg?await hIe({ffmpegExecutablePath:ffBin,recordingSystem:r,recordingOutput:n,game:A,recordAudio:m.recordAudio,audioBitrate:u.audioBitrate,constantRateFactor:u.constantRateFactor,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,inputParameters:u.inputParameters,outputParameters:u.outputParameters,framerate:captureFps,targetFramerate:targetFps,tickrate:e.tickrate,outputFolderPath:a,sequence:m,hudPosition:hudPos,enableSequenceTransitions:enTrans,enableKillCounter:enKills,enableSlowMotion:enSlow,sequenceKills:seqKills,clutches:seqClutches},t):await AIe({recordingSystem:r,game:A,recordAudio:m.recordAudio,framerate:captureFps,outputFolderPath:a,sequence:m},t);
      completedSeqs.push(m);
    }catch(err){
      if(t.aborted)throw err;
      logger.error(\`Failed to convert sequence \${m.number}\`,err);
      lastErr=err;
    }
  }
  if(completedSeqs.length===0&&lastErr)throw lastErr;
  let introVideoPath,outroVideoPath;
  if(showIntro&&o===Bs.FFmpeg&&completedSeqs.length>0&&matchCtx){
    try{
      introVideoPath=await generateIntroVideoWithFFmpeg({ffmpegExecutablePath:ffBin,game:A,mapName:matchCtx.mapName||e.mapName,matchDate:matchCtx.matchDate,teamAName:matchCtx.teamAName,teamAScore:matchCtx.teamAScore,teamBName:matchCtx.teamBName,teamBScore:matchCtx.teamBScore,players:matchCtx.players,width:e.width,height:e.height,framerate:targetFps,outputFolderPath:a,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,constantRateFactor:u.constantRateFactor,audioBitrate:u.audioBitrate,outputParameters:u.outputParameters},t);
    }catch(err){
      logger.error("Failed to generate 8s intro video, continuing with sequences",err);
    }
  }
  if(showOutro&&o===Bs.FFmpeg&&completedSeqs.length>0&&matchCtx){
    try{
      outroVideoPath=await generateOutroVideoWithFFmpeg({ffmpegExecutablePath:ffBin,game:A,mapName:matchCtx.mapName||e.mapName,teamAName:matchCtx.teamAName,teamAScore:matchCtx.teamAScore,teamBName:matchCtx.teamBName,teamBScore:matchCtx.teamBScore,mvp:matchCtx.mvp,highlights:matchCtx.highlights,showFunAwards:showFun,funAwards:matchCtx.funAwards,width:e.width,height:e.height,framerate:targetFps,outputFolderPath:a,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,constantRateFactor:u.constantRateFactor,audioBitrate:u.audioBitrate,outputParameters:u.outputParameters},t);
    }catch(err){
      logger.error("Failed to generate outro video, continuing with sequences",err);
    }
  }
  if((c||Boolean(introVideoPath)||Boolean(outroVideoPath))&&completedSeqs.length>0){
    f();
    let H=T_e(l,{mapName:e.mapName,checksum:e.checksum,game:e.game,encoderSoftware:e.encoderSoftware,width:e.width,height:e.height,framerate:e.framerate});
    await mIe({ffmpegExecutablePath:ffBin,outputFolderPath:a,sequences:completedSeqs,videoContainer:u.videoContainer,fileName:H,introVideoPath,outroVideoPath},t);
  }
}`;

serverJs = replaceExact(serverJs, oldBuildVideosFn, newBuildVideosFn, 'buildVideos (Ayt)');

// 3.5 Patch _L and gQ to reconcile player teams
const oldInsertCsvEnd = `eCe({demoName:i,databaseSettings:o,outputFolderPath:r})])}catch(n){throw await m_([t]),n}`;
const newInsertCsvEnd = `eCe({demoName:i,databaseSettings:o,outputFolderPath:r})]);await reconcileMatchPlayerTeams(t)}catch(n){throw await m_([t]),n}`;
serverJs = replaceExact(serverJs, oldInsertCsvEnd, newInsertCsvEnd, 'reconcile player teams on demo insert (_L)');

const oldGqFetch = `for(let o of e){let{checksum:i,comment:s}=o,[a,c]=await Promise.all([sQ(i),aQ(i)])`;
const newGqFetch = `for(let o of e){let{checksum:i,comment:s}=o;await reconcileMatchPlayerTeams(i);let[a,c]=await Promise.all([sQ(i),aQ(i)])`;
serverJs = replaceExact(serverJs, oldGqFetch, newGqFetch, 'reconcile player teams on match fetch (gQ)');

// 4. Patch launchParameters and background hidden window mode in BT (HLAE) and hn (startCounterStrike) in server.js
const psHideScript = `Add-Type -Name Win32Hide -Namespace CsDm -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);'; for ($i = 0; $i -lt 50; $i++) { $procs = Get-Process -Name "csgo","cs2" -ErrorAction SilentlyContinue; foreach ($p in $procs) { if ($p.MainWindowHandle -ne [IntPtr]::Zero) { [CsDm.Win32Hide]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, -32000, -32000, 0, 0, 0x0011) | Out-Null } }; Start-Sleep -Milliseconds 500 }`;
const encodedPsHide = Buffer.from(psHideScript, 'utf16le').toString('base64');

serverJs = replaceExact(
  serverJs,
  `{width:c,height:l,displayMode:u,launchParameters:A}=a.playback,d=["-insecure","-novid"];`,
  `{width:c,height:l,displayMode:u,launchParameters:A}=a.playback,d=["-insecure","-novid","-high","+engine_no_focus_sleep","0","+mat_queue_mode","2"],hideWin=t.uninstallPluginOnExit===!1&&a.video.hideGameWindow!==!1;hideWin&&d.push("-noborder","-x","-32000","-y","-32000");`,
  'HLAE launchParameters (BT)',
);

serverJs = replaceExact(
  serverJs,
  `let N=\`"\${o}" \${b.join(" ")}\`;t.onGameStart?.(),await dEt({command:N,signal:n,game:r})`,
  `let N=\`"\${o}" \${b.join(" ")}\`;hideWin&&(0,YX.exec)("powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encodedPsHide}",{windowsHide:!0});t.onGameStart?.(),await dEt({command:N,signal:n,game:r})`,
  'HLAE SetWindowPos helper (BT)',
);

serverJs = replaceExact(
  serverJs,
  `{width:l,height:u,displayMode:A,launchParameters:d}=c.playback,f=["-insecure","-novid"];`,
  `{width:l,height:u,displayMode:A,launchParameters:d}=c.playback,f=["-insecure","-novid","-high","+engine_no_focus_sleep","0","+mat_queue_mode","2"],hideWin=t.uninstallPluginOnExit===!1&&c.video.hideGameWindow!==!1;hideWin&&f.push("-noborder","-x","-32000","-y","-32000");`,
  'startCounterStrike launchParameters (hn)',
);

serverJs = replaceExact(
  serverJs,
  `logger.debug("Starting game with command",E),t.onGameStart?.();`,
  `logger.debug("Starting game with command",E),t.onGameStart?.(),hideWin&&Ne&&(0,OIe.exec)("powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encodedPsHide}",{windowsHide:!0});`,
  'startCounterStrike SetWindowPos helper (hn)',
);


// 4.5 Patch kX in server.js to prioritize primary take0000 over subsequent/corrupted takes
const oldKx = `async function kX(t){logger.debug("Getting HLAE take folder path",t);let e=await fn("take*",{cwd:t,absolute:!0,onlyDirectories:!0,deep:1});$X(e);let r=Wn(e);return await FX(r),r}`;
const newKx = `async function kX(t){logger.debug("Getting HLAE take folder path",t);let e=await fn("take*",{cwd:t,absolute:!0,onlyDirectories:!0,deep:1});$X(e);let r=e.find(p=>p.endsWith("take0000")||p.endsWith("take0000\\\\")||p.endsWith("take0000/"))||e[0]||Wn(e);return await FX(r),r}`;
serverJs = replaceExact(serverJs, oldKx, newKx, 'prefer take0000 in kX (server.js)');

fs.writeFileSync(serverJsPath, serverJs, 'utf8');
console.log('Successfully patched app-extracted/server.js');

// 5. Patch VideoCodecInput in assets/index-CaMMgvc3.js
const oldVideoCodecInput = `function VideoCodecInput(){let _=(0,$.c)(7),{settings:x,updateSettings:T}=useVideoSettings(),t0;_[0]!==x.ffmpegSettings.videoCodec||_[1]!==T?(t0=async _=>{let D=_.target.value.trim();D===\`\`?_.target.value=vl.video.ffmpegSettings.videoCodec:D!==x.ffmpegSettings.videoCodec&&await T({ffmpegSettings:{videoCodec:D}})},_[0]=x.ffmpegSettings.videoCodec,_[1]=T,_[2]=t0):t0=_[2];let D=t0,O;_[3]===Symbol.for(\`react.memo_cache_sentinel\`)?(O=(0,Q.jsx)(Trans,{id:\`XZW4KI\`}),_[3]=O):O=_[3];let k;return _[4]!==D||_[5]!==x.ffmpegSettings.videoCodec?(k=(0,Q.jsx)(TextInput,{label:O,onBlur:D,defaultValue:x.ffmpegSettings.videoCodec},x.ffmpegSettings.videoCodec),_[4]=D,_[5]=x.ffmpegSettings.videoCodec,_[6]=k):k=_[6],k}`;

const newVideoCodecInput = `const GPU_CODEC_PRESETS=[{value:"h264_nvenc",label:"h264_nvenc (GPU NVIDIA - Rápido)"},{value:"hevc_nvenc",label:"hevc_nvenc (GPU NVIDIA HEVC)"},{value:"h264_amf",label:"h264_amf (GPU AMD)"},{value:"h264_qsv",label:"h264_qsv (GPU Intel)"},{value:"libx264",label:"libx264 (CPU Padrão)"},{value:"libx265",label:"libx265 (CPU HEVC)"}];function VideoCodecInput(){let{settings:x,updateSettings:T}=useVideoSettings(),cur=x.ffmpegSettings.videoCodec,opts=GPU_CODEC_PRESETS.some(o=>o.value===cur)?GPU_CODEC_PRESETS:[...GPU_CODEC_PRESETS,{value:cur,label:\`\${cur} (Custom)\`}],onBlur=async e=>{let D=e.target.value.trim();D===""?e.target.value=vl.video.ffmpegSettings.videoCodec:D!==x.ffmpegSettings.videoCodec&&await T({ffmpegSettings:{videoCodec:D}})};return(0,Q.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,Q.jsx)(Select$1,{label:(0,Q.jsx)(Trans,{id:"XZW4KI"}),options:opts,value:cur,onChange:async c=>{await T({ffmpegSettings:{videoCodec:c}})}}),(0,Q.jsx)(TextInput,{onBlur,defaultValue:cur},cur)]})}`;

uiJs = replaceExact(uiJs, oldVideoCodecInput, newVideoCodecInput, 'VideoCodecInput');

// 6. Add GenerateMatchHighlightsButton + Dialog + buildMatchHighlightsSequences
const oldGeneratePlayerBtn = `function GeneratePlayerSequencesButton(){let _=(0,$.c)(5),{showDialog:x}=useDialog(),t0;_[0]===x?t0=_[1]:(t0=()=>{x((0,Q.jsx)(SelectPlayerDialog,{}))},_[0]=x,_[1]=t0);let T=t0,D;_[2]===Symbol.for(\`react.memo_cache_sentinel\`)?(D=(0,Q.jsx)(Trans,{id:\`dbczBE\`}),_[2]=D):D=_[2];let O;return _[3]===T?O=_[4]:(O=(0,Q.jsx)(Button$1,{onClick:T,children:D}),_[3]=T,_[4]=O),O}`;

const highlightsCodeToAdd = `${oldGeneratePlayerBtn}
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
  return isNs||isKnife||isZeus||isSsgCollat;
}
function buildMatchHighlightsSequences({match,steamIds,rounds,weapons,perspective,minKillsInRound,lifeMode,includeClutches,minClutchOpponents,guaranteeAllPlayers,minSequencesPerPlayer,adaptiveThresholdForLowFraggers,specialFilters,startSecondsBeforeEvent,endSecondsAfterEvent,maxSecondsBetweenEvents,settings,firstSequenceNumber,rapidKillsEnabled=!1,rapidMinKills=3,rapidWindowSeconds=5,alwaysIncludeWildcardKills=!0,maxVideoMinutes=0}){
  if(steamIds.length===0||match.kills.length===0)return[];
  let ssgCollatTickMap=new Map();
  for(let k of match.kills||[]){
    let w=String(k.weaponName??k.weapon_name??"").toLowerCase();
    if((w.includes("ssg")||w.includes("scout"))&&k.killerSteamId){
      let key=\`\${k.roundNumber}:\${k.killerSteamId}:\${k.tick}\`;
      ssgCollatTickMap.set(key,(ssgCollatTickMap.get(key)??0)+1);
    }
  }
  for(let k of match.kills||[]){
    let key=\`\${k.roundNumber}:\${k.killerSteamId}:\${k.tick}\`;
    if((ssgCollatTickMap.get(key)??0)>=2){
      k.isSsgCollat=!0;
    }
  }
  let firstKillIdPerRound=new Map(),bombActionPlayersPerRound=new Set();
  if(Array.isArray(match.bombsPlanted)){
    for(let p of match.bombsPlanted)bombActionPlayersPerRound.add(\`\${p.roundNumber}:\${p.planterSteamId}\`);
  }
  if(Array.isArray(match.bombsDefused)){
    for(let d of match.bombsDefused)bombActionPlayersPerRound.add(\`\${d.roundNumber}:\${d.defuserSteamId}\`);
  }
  let currentSegmentIndex=new Map(),lastBotControlState=new Map(),killSegmentKeyById=new Map(),killsPerSegment=new Map(),totalMatchKillsPerPlayer=new Map();
  for(let kill of match.kills){
    if(!firstKillIdPerRound.has(kill.roundNumber))firstKillIdPerRound.set(kill.roundNumber,kill.id);
    if(kill.victimSteamId){
      let vKey=\`\${kill.roundNumber}:\${kill.victimSteamId}\`;
      currentSegmentIndex.set(vKey,(currentSegmentIndex.get(vKey)??0)+1);
      lastBotControlState.delete(vKey);
    }
    if(!kill.killerSteamId||kill.killerSteamId===kill.victimSteamId)continue;
    if(lifeMode==="human_only"&&kill.isKillerControllingBot&&!(alwaysIncludeWildcardKills&&isWildcardKill(kill)))continue;
    if(lifeMode==="bot_only"&&!kill.isKillerControllingBot&&!(alwaysIncludeWildcardKills&&isWildcardKill(kill)))continue;
    totalMatchKillsPerPlayer.set(kill.killerSteamId,(totalMatchKillsPerPlayer.get(kill.killerSteamId)??0)+1);
    let kKey=\`\${kill.roundNumber}:\${kill.killerSteamId}\`,segIdx=currentSegmentIndex.get(kKey)??0;
    if(lifeMode!=="whole_round"){
      let prevBot=lastBotControlState.get(kKey);
      if(prevBot!==void 0&&prevBot!==kill.isKillerControllingBot){
        segIdx+=1;
        currentSegmentIndex.set(kKey,segIdx);
      }
      lastBotControlState.set(kKey,kill.isKillerControllingBot);
    }
    let segKey=lifeMode==="whole_round"?kKey:\`\${kKey}:seg\${segIdx}\`;
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
  let kills=match.kills.filter(kill=>{
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
        (specialFilters.onlyBombAction&&bombActionPlayersPerRound.has(\`\${kill.roundNumber}:\${kill.killerSteamId}\`))
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
    if(currentSeq===null){
      currentSeq={startTick:evStart,endTick:evEnd,roundNumber:ev.roundNumber,playerCameras:[{tick:evStart,playerSteamId:ev.playerSteamId}],primaryPlayerSteamId:ev.playerSteamId,eventCount:1,isWildcard:Boolean(ev.isWildcard)};
    }else if(currentSeq.roundNumber===ev.roundNumber&&evStart<=currentSeq.endTick+maxTicksBetween){
      currentSeq.endTick=Math.max(currentSeq.endTick,evEnd);
      currentSeq.eventCount+=1;
      if(ev.isWildcard)currentSeq.isWildcard=!0;
      let lastCam=currentSeq.playerCameras[currentSeq.playerCameras.length-1];
      if(lastCam.playerSteamId!==ev.playerSteamId)currentSeq.playerCameras.push({tick:Math.max(currentSeq.startTick+16,evStart),playerSteamId:ev.playerSteamId});
    }else{
      rawSequences.push(currentSeq);
      currentSeq={startTick:evStart,endTick:evEnd,roundNumber:ev.roundNumber,playerCameras:[{tick:evStart,playerSteamId:ev.playerSteamId}],primaryPlayerSteamId:ev.playerSteamId,eventCount:1,isWildcard:Boolean(ev.isWildcard)};
    }
  }
  if(currentSeq!==null)rawSequences.push(currentSeq);
  if(guaranteeAllPlayers){
    for(let sid of steamIds){
      let count=rawSequences.filter(s=>s.primaryPlayerSteamId===sid||s.playerCameras.some(c=>c.playerSteamId===sid)).length;
      if(count<minSequencesPerPlayer){
        let needed=minSequencesPerPlayer-count;
        let pKills=match.kills.filter(k=>k.killerSteamId===sid&&(!roundsSelected||rounds.includes(k.roundNumber))).sort((a,b)=>b.tick-a.tick);
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
  let formatDur=sec=>{let r=Math.max(0,Math.round(sec)),m=Math.floor(r/60),s=r%60;return\`\${String(m).padStart(2,"0")}:\${String(s).padStart(2,"0")}\`};
  let applyPlayers=ids=>{setSelectedSteamIds(ids);setSelectedWeapons(ids.length===0?[]:uniqueArray(match.kills.filter(k=>ids.includes(k.killerSteamId)).map(k=>k.weaponName)))};
  let applyTimelineOnly=()=>{
    if(finalSequences.length===0)return;
    dispatch(Fs({demoFilePath:match.demoFilePath,sequences:finalSequences}));
    hideDialog();
  };
  let applyTimelineAndRecordNow=async()=>{
    if(finalSequences.length===0||isStartingRecording)return;
    setIsStartingRecording(!0);
    await updateSettings({concatenateSequences:!0,hideGameWindow,hudPosition,showIntroScreen,showOutroScreen,showFunAwards,enableKillCounter,enableSlowMotion,enableSequenceTransitions});
    dispatch(Fs({demoFilePath:match.demoFilePath,sequences:finalSequences}));
    try{
      let payload={...settings,concatenateSequences:!0,hideGameWindow,hudPosition,showIntroScreen,showOutroScreen,showFunAwards,enableKillCounter,enableSlowMotion,enableSequenceTransitions,checksum:match.checksum,game:match.game,tickrate:match.tickrate,demoPath:match.demoFilePath,mapName:match.mapName,sequences:finalSequences};
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
        (0,Q.jsx)(Checkbox,{label:"Sempre incluir abates coringas (No-Scope, Faca, Zeus e Collat SSG 08 - isentos de filtros)",isChecked:alwaysIncludeWildcardKills,onChange:e=>setAlwaysIncludeWildcardKills(e.target.checked)}),
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
}`;

const aiHighlightsCode = fs.readFileSync(new URL('./patches/ai-highlights.js', import.meta.url), 'utf8');
uiJs = replaceExact(uiJs, oldGeneratePlayerBtn, `${highlightsCodeToAdd}\n${aiHighlightsCode}`, 'GenerateMatchHighlightsButton + AI highlights');

// Wire GenerateMatchHighlightsButton + GenerateAiHighlightsButton into MatchVideo toolbar in assets/index-CaMMgvc3.js
const oldMatchVideoToolbar = `children:[T,D,O,k,A,j,M,(0,Q.jsx)(\`div\`,{className:\`ml-auto\`,children:(0,Q.jsx)(DocumentationLink,{url:\`https://cs-demo-manager.com/docs/guides/video\`})})]`;
const newMatchVideoToolbar = `children:[T,(0,Q.jsx)(GenerateMatchHighlightsButton,{}),(0,Q.jsx)(GenerateAiHighlightsButton,{}),D,O,k,A,j,M,(0,Q.jsx)(\`div\`,{className:\`ml-auto\`,children:(0,Q.jsx)(DocumentationLink,{url:\`https://cs-demo-manager.com/docs/guides/video\`})})]`;

uiJs = replaceExact(uiJs, oldMatchVideoToolbar, newMatchVideoToolbar, 'MatchVideo toolbar');

fs.writeFileSync(uiJsPath, uiJs, 'utf8');
console.log('Successfully patched app-extracted/assets/index-CaMMgvc3.js');
