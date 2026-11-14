import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function replaceExact(content, search, replace, desc) {
  const idx = content.indexOf(search);
  if (idx === -1) {
    throw new Error(`Target not found for patch: ${desc}`);
  }
  return content.substring(0, idx) + replace + content.substring(idx + search.length);
}

const rootDir = path.resolve(import.meta.dirname, '..');
const appExtractedDir = path.join(rootDir, 'app-extracted');
const backupsDir = path.join(rootDir, 'backups');
const patchesDir = path.join(rootDir, 'scripts', 'patches');

// 1. Locate server.js
const serverJsPath = path.join(appExtractedDir, 'server.js');
if (!fs.existsSync(serverJsPath)) {
  throw new Error(`server.js not found at ${serverJsPath}`);
}

// 2. Locate UI bundle (assets/index-*.js)
const assetsDir = path.join(appExtractedDir, 'assets');
const assetFiles = fs.readdirSync(assetsDir);
const uiJsFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.js') && !f.endsWith('.map'));
if (!uiJsFile) {
  throw new Error(`Main UI bundle index-*.js not found in ${assetsDir}`);
}
const uiJsPath = path.join(assetsDir, uiJsFile);

console.log(`[apply-patches] Root dir: ${rootDir}`);
console.log(`[apply-patches] Target UI bundle: ${uiJsFile}`);

// If clean backups exist and targets are already patched, restore from clean backup before re-patching
const serverBakPath = path.join(backupsDir, 'server.js.321.orig.bak');
const uiBakPath = path.join(backupsDir, `${uiJsFile}.orig.bak`);

let serverJs = fs.readFileSync(serverJsPath, 'utf8');
if (serverJs.includes('escFfPath') && fs.existsSync(serverBakPath)) {
  console.log('[apply-patches] Restoring server.js from clean backup before re-patching...');
  serverJs = fs.readFileSync(serverBakPath, 'utf8');
}

let uiJs = fs.readFileSync(uiJsPath, 'utf8');
if ((uiJs.includes('GenerateMatchHighlightsButton') || uiJs.includes('GPU_CODEC_PRESETS')) && fs.existsSync(uiBakPath)) {
  console.log(`[apply-patches] Restoring ${uiJsFile} from clean backup before re-patching...`);
  uiJs = fs.readFileSync(uiBakPath, 'utf8');
}

function adaptUiPatchTo321(code) {
  return code
    .replace(/\(0,\s*Q\.jsx\)/g, '(0,$.jsx)')
    .replace(/\(0,\s*Q\.jsxs\)/g, '(0,$.jsxs)')
    .replace(/\(0,\s*W\.use/g, '(0,Q.use')
    .replace(/\bzg\./g, 'Kg.')
    .replace(/\bMu\(\)/g, 'hd()')
    .replace(/\bVs\./g, 'gc.')
    .replace(/\bFs\(/g, 'lc(')
    .replace(/\bLg\./g, 'Ug.')
    .replace(/\bNu\./g, 'gd.')
    .replace(/\bSl\./g, 'tu.');
}

// ==========================================
// A. PATCH UI (assets/index-*.js)
// ==========================================
console.log('[apply-patches] Applying UI patches...');

// UI 0. buildPlayersOptions safe polymorphic wrapper
const oldBpo = 'function buildPlayersOptions({players:u,highlightedSteamIds:f,voiceSteamIds:p,playerVoicesEnabled:O}){let j=getVoiceSteamIds({players:u,voiceSteamIds:p,playerVoicesEnabled:O});return u.map(u=>({steamId:u.steamId,playerName:u.name,showKill:!0,highlightKill:f.includes(u.steamId),isVoiceEnabled:j.includes(u.steamId)}))}';
const newBpo = 'function buildPlayersOptions(u,f,p,O){if(Array.isArray(u)){u={players:u,highlightedSteamIds:f||[],voiceSteamIds:p||[],playerVoicesEnabled:O};}let{players:a,highlightedSteamIds:b=[],voiceSteamIds:c=[],playerVoicesEnabled:d}=u||{};let j=getVoiceSteamIds({players:a,voiceSteamIds:c,playerVoicesEnabled:d});return(a||[]).map(x=>({steamId:x.steamId,playerName:x.name,showKill:!0,highlightKill:(b||[]).includes(x.steamId),isVoiceEnabled:(j||[]).includes(x.steamId)}))}';
uiJs = replaceExact(uiJs, oldBpo, newBpo, 'buildPlayersOptions safe wrapper');

// UI 1. VideoCodecInput
const oldVideoCodecInput = `function VideoCodecInput(){let u=(0,xt.c)(7),{settings:f,updateSettings:p}=useVideoSettings(),t0;u[0]!==f.ffmpegSettings.videoCodec||u[1]!==p?(t0=async u=>{let O=u.target.value.trim();O===\`\`?u.target.value=Zl.video.ffmpegSettings.videoCodec:O!==f.ffmpegSettings.videoCodec&&await p({ffmpegSettings:{videoCodec:O}})},u[0]=f.ffmpegSettings.videoCodec,u[1]=p,u[2]=t0):t0=u[2];let O=t0,j;u[3]===Symbol.for(\`react.memo_cache_sentinel\`)?(j=(0,$.jsx)(Trans,{id:\`XZW4KI\`}),u[3]=j):j=u[3];let I;return u[4]!==O||u[5]!==f.ffmpegSettings.videoCodec?(I=(0,$.jsx)(TextInput,{label:j,onBlur:O,defaultValue:f.ffmpegSettings.videoCodec},f.ffmpegSettings.videoCodec),u[4]=O,u[5]=f.ffmpegSettings.videoCodec,u[6]=I):I=u[6],I}`;
const newVideoCodecInput = `const GPU_CODEC_PRESETS=[{value:"h264_nvenc",label:"h264_nvenc (GPU NVIDIA - Rápido)"},{value:"hevc_nvenc",label:"hevc_nvenc (GPU NVIDIA HEVC)"},{value:"h264_amf",label:"h264_amf (GPU AMD)"},{value:"h264_qsv",label:"h264_qsv (GPU Intel)"},{value:"libx264",label:"libx264 (CPU Padrão)"},{value:"libx265",label:"libx265 (CPU HEVC)"}];
function VideoCodecInput(){
  let{settings:f,updateSettings:p}=useVideoSettings(),cur=f.ffmpegSettings.videoCodec||"libx264";
  let hasPreset=GPU_CODEC_PRESETS.some(x=>x.value===cur);
  let options=hasPreset?GPU_CODEC_PRESETS:[...GPU_CODEC_PRESETS,{value:cur,label:\`\${cur} (Personalizado)\`}];
  return(0,$.jsx)(Select$1,{label:(0,$.jsx)(Trans,{id:\`XZW4KI\`}),options,value:cur,onChange:async v=>{if(v)await p({ffmpegSettings:{videoCodec:v}})}});
}`;
uiJs = replaceExact(uiJs, oldVideoCodecInput, newVideoCodecInput, 'VideoCodecInput');

// UI 2. GeneratePlayerSequencesButton + Match Highlights + AI highlights + Lowlights
const oldGeneratePlayerBtn = `function GeneratePlayerSequencesButton(){let u=(0,xt.c)(5),{showDialog:f}=useDialog(),t0;u[0]===f?t0=u[1]:(t0=()=>{f((0,$.jsx)(SelectPlayerDialog,{}))},u[0]=f,u[1]=t0);let p=t0,O;u[2]===Symbol.for(\`react.memo_cache_sentinel\`)?(O=(0,$.jsx)(Trans,{id:\`dbczBE\`}),u[2]=O):O=u[2];let j;return u[3]===p?j=u[4]:(j=(0,$.jsx)(Button$1,{onClick:p,children:O}),u[3]=p,u[4]=j),j}`;
const matchHighlightsCode = fs.readFileSync(path.join(patchesDir, 'match-highlights.js'), 'utf8');
const aiHighlightsCode = fs.readFileSync(path.join(patchesDir, 'ai-highlights.js'), 'utf8');
const lowlightsCode = fs.readFileSync(path.join(patchesDir, 'lowlights.js'), 'utf8');
const adaptedUiCustomCode = adaptUiPatchTo321(`${matchHighlightsCode}\n${aiHighlightsCode}\n${lowlightsCode}`);
uiJs = replaceExact(uiJs, oldGeneratePlayerBtn, `${oldGeneratePlayerBtn}\n${adaptedUiCustomCode}`, 'GeneratePlayerSequencesButton + Match/AI Highlights + Lowlights');

// UI 3. MatchVideo toolbar
const oldMatchVideoToolbar = `u[7]===Symbol.for(\`react.memo_cache_sentinel\`)?(V=(0,$.jsxs)(\`div\`,{className:\`flex flex-wrap items-center gap-8\`,children:[p,O,j,I,R,z,B,(0,$.jsx)(\`div\`,{className:\`ml-auto\`,children:(0,$.jsx)(DocumentationLink,{url:\`https://cs-demo-manager.com/docs/guides/video\`})})]}),u[7]=V):V=u[7];`;
const newMatchVideoToolbar = `u[7]===Symbol.for(\`react.memo_cache_sentinel\`)?(V=(0,$.jsxs)(\`div\`,{className:\`flex flex-wrap items-center gap-8\`,children:[p,(0,$.jsx)(GenerateMatchHighlightsButton,{}),(0,$.jsx)(GenerateAiHighlightsButton,{}),(0,$.jsx)(GenerateLowlightsButton,{}),O,j,I,R,z,B,(0,$.jsx)(\`div\`,{className:\`ml-auto\`,children:(0,$.jsx)(DocumentationLink,{url:\`https://cs-demo-manager.com/docs/guides/video\`})})]}),u[7]=V):V=u[7];`;
uiJs = replaceExact(uiJs, oldMatchVideoToolbar, newMatchVideoToolbar, 'MatchVideo toolbar');

// UI 4. Default video outputFileName in uiJs
const oldUiDefVideo = 'terRecording:!0,keepRawFilesOnGameError:!1,concatenateSequences:!1,outputFileName:``,showXRay:!0';
const newUiDefVideo = 'terRecording:!0,keepRawFilesOnGameError:!1,concatenateSequences:!1,outputFileName:`{date}-{map}`,showXRay:!0';
uiJs = replaceExact(uiJs, oldUiDefVideo, newUiDefVideo, 'Default video outputFileName in uiJs');

// UI 5. OutputFileNameInput placeholder
const oldUiOutputInput = 'TextInput,{label:R,defaultValue:f.outputFileName,onBlur:O,placeholder:`output`}';
const newUiOutputInput = 'TextInput,{label:R,defaultValue:f.outputFileName||"{date}-{map}",onBlur:O,placeholder:`{date}-{map}`}';
uiJs = replaceExact(uiJs, oldUiOutputInput, newUiOutputInput, 'OutputFileNameInput defaultValue and placeholder');

// UI 6. Date placeholder description
const oldUiDatePlaceholderDesc = 'case SY.Date:return(0,$.jsx)(Trans,{id:`wf5SDm`});';
const newUiDatePlaceholderDesc = 'case SY.Date:return(0,$.jsx)(`span`,{children:`Data (padrão Brasil dia-mês-ano: 30-10-2026)`});';
uiJs = replaceExact(uiJs, oldUiDatePlaceholderDesc, newUiDatePlaceholderDesc, 'Date placeholder description');

fs.writeFileSync(uiJsPath, uiJs, 'utf8');
console.log(`[apply-patches] ${uiJsFile} patched successfully!`);

// ==========================================
// B. PATCH SERVER (server.js)
// ==========================================
console.log('[apply-patches] Applying server.js patches...');

// Server 0. Default video settings & outputFileName
serverJs = replaceExact(
  serverJs,
  `video:{recordingSystem:ls.CounterStrike,recordingOutput:us.Video,closeGameAfterRecording:!0,keepRawFilesOnGameError:!1,concatenateSequences:!1,outputFileName:\`\`,showXRay:!0`,
  `video:{recordingSystem:ls.CounterStrike,recordingOutput:us.Video,closeGameAfterRecording:!0,keepRawFilesOnGameError:!1,concatenateSequences:!1,outputFileName:\`{date}-{map}\`,showXRay:!0,hideGameWindow:!0,hudPosition:"top-left",showIntroScreen:!0,showOutroScreen:!0,showFunAwards:!0,enableKillCounter:!0,enableSlowMotion:!0,enableFastForward:!0,enableSequenceTransitions:!0`,
  'default video settings and outputFileName in server.js'
);

// Server 1. CSGO fast-forward in MM
const oldMmSearch = `d.addExecCommand(g,t),e.showKill&&d.addExecCommand(g,\`mirv_deathmsg filter add attackerMatch=x\${e.steamId} attackerIsLocal=\${e.highlightKill?\`1\`:\`0\`} block=0\`)}`;
const newMmReplace = `d.addExecCommand(g,t),e.showKill&&d.addExecCommand(g,\`mirv_deathmsg filter add attackerMatch=x\${e.steamId} attackerIsLocal=\${e.highlightKill?\`1\`:\`0\`} block=0\`)}if(e==="playback"&&Array.isArray(m.fastForwardIntervals)){for(let ff of m.fastForwardIntervals){d.addExecCommand(ff.startTick,"demo_timescale 2");d.addExecCommand(ff.endTick,"demo_timescale 1")}}`;
serverJs = replaceExact(serverJs, oldMmSearch, newMmReplace, 'CSGO playback fast-forward in MM');

// Server 2. CS2 fast-forward in fP
const oldFpSearch = `m.addExecCommand(_,t),e.showKill&&m.addExecCommand(_,\`mirv_deathmsg filter add attackerMatch=x\${e.steamId} attackerIsLocal=\${e.highlightKill?\`1\`:\`0\`} block=0\`)}`;
const newFpReplace = `m.addExecCommand(_,t),e.showKill&&m.addExecCommand(_,\`mirv_deathmsg filter add attackerMatch=x\${e.steamId} attackerIsLocal=\${e.highlightKill?\`1\`:\`0\`} block=0\`)}if(e==="playback"&&Array.isArray(l.fastForwardIntervals)){for(let ff of l.fastForwardIntervals){m.addExecCommand(ff.startTick,"demo_timescale 2");m.addExecCommand(ff.endTick,"demo_timescale 1")}}`;
serverJs = replaceExact(serverJs, oldFpSearch, newFpReplace, 'CS2 playback fast-forward in fP');

// Server 2.5 Slow-motion capture framerate in HLAE record call
const oldCapFpsSearch = `p===$.Game.CSGO?await MM({type:\`record\`,recordingSystem:r,recordingOutput:i,encoderSoftware:a,outputFolderPath:h,framerate:o,demoPath:s,sequences:y,closeGameAfterRecording:u,tickrate:f,ffmpegSettings:m}):await fP({type:\`record\`,recordingSystem:r,recordingOutput:i,encoderSoftware:a,outputFolderPath:h,framerate:o,demoPath:s,sequences:y,closeGameAfterRecording:u,tickrate:f,players:await LP(t),`;
const newCapFpsReplace = `let capFpsQ=(e.enableSlowMotion??!0)?Math.max(o*2,120):o;p===$.Game.CSGO?await MM({type:\`record\`,recordingSystem:r,recordingOutput:i,encoderSoftware:a,outputFolderPath:h,framerate:capFpsQ,demoPath:s,sequences:y,closeGameAfterRecording:u,tickrate:f,ffmpegSettings:m}):await fP({type:\`record\`,recordingSystem:r,recordingOutput:i,encoderSoftware:a,outputFolderPath:h,framerate:capFpsQ,demoPath:s,sequences:y,closeGameAfterRecording:u,tickrate:f,players:await LP(t),`;
serverJs = replaceExact(serverJs, oldCapFpsSearch, newCapFpsReplace, 'slow-motion capture framerate');

// Server 3. T_e / dI (date format dd-MM-yyyy + default {date}-{map})
const oldDi = `function dI(e,t){if(!e)return\`output\`;let n=/* @__PURE__ */ new Date,r=e.replace(/\\{map\\}/g,t.mapName).replace(/\\{checksum\\}/g,t.checksum).replace(/\\{game\\}/g,t.game).replace(/\\{date\\}/g,lI(n,\`yyyy-MM-dd\`)).replace(/\\{time\\}/g,lI(n,\`HH-mm-ss\`)).replace(/\\{encoder\\}/g,t.encoderSoftware).replace(/\\{resolution\\}/g,\`\${t.width}x\${t.height}\`).replace(/\\{framerate\\}/g,t.framerate.toString());return r=r.replace(/[<>:"\\\\/|?*]/g,\`_\`),r=r.trim(),r.length>0?r:\`output\`}`;
const newDi = `function dI(e,t){
  let tpl=(e&&e!==\`output\`&&e.trim()!==\`\`)?e.trim():\`{date}-{map}\`;
  let r=t.matchDate?new Date(t.matchDate):new Date();
  if(Number.isNaN(r.getTime()))r=new Date();
  let dd=String(r.getDate()).padStart(2,\`0\`),mm=String(r.getMonth()+1).padStart(2,\`0\`),yyyy=r.getFullYear();
  let dateBR=\`\${dd}-\${mm}-\${yyyy}\`;
  let n=tpl
    .replace(/\\{map\\}/g,t.mapName||"unknown")
    .replace(/\\{checksum\\}/g,t.checksum||"")
    .replace(/\\{game\\}/g,t.game||"")
    .replace(/\\{date\\}/g,dateBR)
    .replace(/\\{time\\}/g,\`\${String(r.getHours()).padStart(2,"0")}-\${String(r.getMinutes()).padStart(2,"0")}-\${String(r.getSeconds()).padStart(2,"0")}\`)
    .replace(/\\{encoder\\}/g,t.encoderSoftware||"")
    .replace(/\\{resolution\\}/g,\`\${t.width||1920}x\${t.height||1080}\`)
    .replace(/\\{framerate\\}/g,(t.framerate||60).toString());
  n=n.replace(/[<>:"\\\\/|?*]/g,"_").trim();
  return n.length>0?n:\`\${dateBR}-\${t.mapName||"output"}\`;
}`;
serverJs = replaceExact(serverJs, oldDi, newDi, 'dI (date format dd-MM-yyyy + default {date}-{map})');

// Server 5. fM (prefer take0000 in HLAE)
const oldFm = `async function fM(e){logger.debug(\`Getting HLAE take folder path\`,e);let t=await wD(\`take*\`,{cwd:e,absolute:!0,onlyDirectories:!0,deep:1});dM(t);let n=tT(t);return await uM(n),n}`;
const newFm = `async function fM(e){logger.debug(\`Getting HLAE take folder path\`,e);let t=await wD(\`take*\`,{cwd:e,absolute:!0,onlyDirectories:!0,deep:1});dM(t);let n=t.find(p=>p.endsWith("take0000")||p.endsWith("\\\\take0000"))||tT(t);return await uM(n),n}`;
serverJs = replaceExact(serverJs, oldFm, newFm, 'fM (prefer take0000)');

// Server 6. OM (concatenateVideosFromSequences)
const oldOm = `async function OM({ffmpegExecutablePath:e,sequences:t,outputFolderPath:n,videoContainer:r,fileName:i},a){let o=DM(t).map(e=>Zj(n,e,r)),s=p.default.join(Vn(),\`videos.txt\`);await K.default.writeFile(s,o.map(e=>\`file '\${e}'\`).join(\`
\`),\`utf8\`),await wM(e,[\`-y\`,\`-f concat\`,\`-safe 0\`,\`-i "\${s}"\`,\`-c copy\`,\`"\${p.default.join(n,\`\${i}.\${r}\`)}"\`],a),await Promise.all(o.map(e=>K.default.remove(e)))}`;

const newOm = `async function OM({ffmpegExecutablePath:e,sequences:t,outputFolderPath:n,videoContainer:r,fileName:i,introVideoPath:introPath,outroVideoPath:outroPath},a){let allPaths=[];if(introPath){allPaths.push(introPath)}else{let defIntro=p.default.join(n,\`intro-0.\${r}\`);if(await K.default.pathExists(defIntro))allPaths.push(defIntro)}for(let u of DM(t))allPaths.push(Zj(n,u,r));if(outroPath){allPaths.push(outroPath)}else{let defOutro=p.default.join(n,\`outro-0.\${r}\`);if(await K.default.pathExists(defOutro))allPaths.push(defOutro)}let o=[];for(let pathItem of allPaths){if(await K.default.pathExists(pathItem))o.push(pathItem)}if(o.length===0)return;let outFile=p.default.join(n,\`\${i}.\${r}\`);if(o.length===1){await K.default.move(o[0],outFile,{overwrite:!0});return}let s=p.default.join(n,"videos.txt");await K.default.writeFile(s,o.map(u=>"file '" + u.replaceAll("\\\\","/").replaceAll("'","'\\\\''") + "'").join("\\n"),"utf8");try{let l=r==="mp4"?["-y","-fflags +genpts","-f concat","-safe 0",\`-i "\${s}"\`,"-c:v copy","-c:a aac","-b:a 256K","-af aresample=async=1:first_pts=0","-movflags +faststart",\`"\${outFile}"\`]:["-y","-fflags +genpts","-f concat","-safe 0",\`-i "\${s}"\`,"-c copy",\`"\${outFile}"\`];await wM(e,l,a)}catch{let l=["-y","-fflags +genpts","-f concat","-safe 0",\`-i "\${s}"\`,"-c copy",\`"\${outFile}"\`];await wM(e,l,a)}finally{await K.default.remove(s).catch(()=>{})}await Promise.all(o.map(u=>K.default.remove(u).catch(()=>{})))}`;
serverJs = replaceExact(serverJs, oldOm, newOm, 'OM (concatenateVideosFromSequences)');

// Server 7. reconcileMatchPlayerTeams on demo insert (Nk) and match fetch (LI/RI loop)
const oldInsertCsvEnd = `ek({demoName:r,outputFolderPath:n})])}catch(t){throw await LO([e]),t}`;
const newInsertCsvEnd = `ek({demoName:r,outputFolderPath:n})]);await reconcileMatchPlayerTeams(e)}catch(t){throw await LO([e]),t}`;
serverJs = replaceExact(serverJs, oldInsertCsvEnd, newInsertCsvEnd, 'reconcile player teams on demo insert (Nk)');

const oldMatchFetch = `for(let e of t){let{checksum:t,comment:i}=e,[a,o]=await Promise.all([LI(t),RI(t)])`;
const newMatchFetch = `for(let e of t){let{checksum:t,comment:i}=e;await reconcileMatchPlayerTeams(t);let[a,o]=await Promise.all([LI(t),RI(t)])`;
serverJs = replaceExact(serverJs, oldMatchFetch, newMatchFetch, 'reconcile player teams on match fetch');

// Server 8. Background hidden window mode & launch parameters in HLAE and CS launchers
const psHideScript = `Add-Type -Name Win32Hide -Namespace CsDm -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);'; for ($i = 0; $i -lt 50; $i++) { $procs = Get-Process -Name "csgo","cs2" -ErrorAction SilentlyContinue; foreach ($p in $procs) { if ($p.MainWindowHandle -ne [IntPtr]::Zero) { [CsDm.Win32Hide]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, -32000, -32000, 0, 0, 0x0011) | Out-Null } }; Start-Sleep -Milliseconds 500 }`;
const encodedPsHide = Buffer.from(psHideScript, 'utf16le').toString('base64');

// HLAE launcher
serverJs = replaceExact(
  serverJs,
  `c=await _s(),{width:l,height:u,displayMode:d,launchParameters:f}=c.playback,m=[\`-insecure\`,\`-novid\`];`,
  `c=await _s(),{width:l,height:u,displayMode:d,launchParameters:f}=c.playback,m=[\`-insecure\`,\`-novid\`,\`-high\`,\`+engine_no_focus_sleep\`,\`0\`,\`+mat_queue_mode\`,\`2\`],hideWin=e.uninstallPluginOnExit===!1&&c.video.hideGameWindow!==!1;hideWin&&m.push(\`-noborder\`,\`-x\`,\`-32000\`,\`-y\`,\`-32000\`);`,
  'HLAE launchParameters'
);

serverJs = replaceExact(
  serverJs,
  `t&&await tN(t,n),e.onGameStart?.();try{await rP({command:w,signal:r,game:n})}`,
  `t&&await tN(t,n),e.onGameStart?.(),hideWin&&(0,k.exec)("powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encodedPsHide}",{windowsHide:!0});try{await rP({command:w,signal:r,game:n})}`,
  'HLAE SetWindowPos helper'
);

// CS launcher
serverJs = replaceExact(
  serverJs,
  `let l=await _s(),{width:u,height:d,displayMode:f,launchParameters:m}=l.playback,h=[\`-insecure\`,\`-novid\`];`,
  `let l=await _s(),{width:u,height:d,displayMode:f,launchParameters:m}=l.playback,h=[\`-insecure\`,\`-novid\`,\`-high\`,\`+engine_no_focus_sleep\`,\`0\`,\`+mat_queue_mode\`,\`2\`],hideWin=e.uninstallPluginOnExit===!1&&l.video.hideGameWindow!==!1;hideWin&&h.push(\`-noborder\`,\`-x\`,\`-32000\`,\`-y\`,\`-32000\`);`,
  'startCounterStrike launchParameters'
);

serverJs = replaceExact(
  serverJs,
  `logger.debug(\`Starting game with command\`,y),e.onGameStart?.();`,
  `logger.debug(\`Starting game with command\`,y),e.onGameStart?.(),hideWin&&(0,k.exec)("powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encodedPsHide}",{windowsHide:!0});`,
  'startCounterStrike SetWindowPos helper'
);

// Server 9. EM + intro/outro/circus/lowlights replacement
const oldEm = `async function EM(e,t){logger.debug(\`Generating video with FFmpeg\`),logger.debug(e);let{tgaFiles:n,wavFilePath:r,videoFilePath:i}=await hM(e),{ffmpegExecutablePath:a,framerate:o,inputParameters:s,videoCodec:c,audioCodec:l,audioBitrate:u,constantRateFactor:d,outputParameters:f,recordingSystem:m,game:h,sequence:g,outputFolderPath:_,videoContainer:v,recordingOutput:y,recordAudio:b}=e;await K.default.ensureDir(_);let x=Zj(_,g,v);if(m===ls.HLAE&&y===us.Video){if(!i)throw logger.error(\`Video file path is null for HLAE video output\`),new $j;let e=[\`-y\`];s!==\`\`&&e.push(s),e.push(\`-i "\${i}"\`);let n=b&&r;if(n){let n=await TM(a,r,l,u,t);e.push(\`-i "\${n}"\`)}return e.push(\`-c copy\`,\`-map 0:v:0\`),n&&e.push(\`-map 1:a:0\`),e.push(\`"\${x}"\`),f!==\`\`&&e.push(f),await wM(a,e,t)}let S,C=p.default.dirname(n[0]);if(m===ls.HLAE)S=p.default.join(C,\`%05d.tga\`);else{let e=Qj(g);S=p.default.join(C,h===$.Game.CSGO?\`\${e}%04d.tga\`:\`\${e}%08d.tga\`)}let w=[\`-y\`,\`-framerate \${o}\`];s!==\`\`&&w.push(s),w.push(\`-i "\${S}"\`);let T=r?await K.default.pathExists(r):!1,E=b&&T;E&&w.push(\`-i "\${r}"\`),w.push(\`-vcodec \${c}\`),E&&w.push(\`-acodec \${l}\`,\`-b:a \${u}K\`),f===\`\`?w.push(\`-pix_fmt yuv420p\`,\`-crf \${d}\`):w.push(f),w.push(\`"\${x}"\`),await wM(a,w,t)}`;

let adaptedHie = fs.readFileSync(path.join(patchesDir, 'server-video-patch.js'), 'utf8');
if (adaptedHie.includes('var PX=v(')) {
  throw new Error('server-video-patch.js still contains leftover 3.20 code (var PX=v()');
}
adaptedHie = adaptedHie.replaceAll('On(H)', 'Qj(H)');
adaptedHie = adaptedHie.replaceAll('On(', 'Qj(');
adaptedHie = adaptedHie.replaceAll('y.Game', '$.Game');
adaptedHie = adaptedHie.replace('async function hIe(t,e){', 'async function EM(t,e){\nvar hIe = EM;');
if (!adaptedHie.includes('async function EM(t,e){')) {
  throw new Error('Failed to adapt hIe -> EM in server-video-patch.js');
}

// Adapt identifiers directly without injecting global aliases that could collide with 3.21.0 functions (e.g. pT, jt, hT)
adaptedHie = adaptedHie.replaceAll('pT.default', 'K.default');
adaptedHie = adaptedHie.replaceAll('pT.', 'K.');
adaptedHie = adaptedHie.replaceAll('R_.default', 'p.default');
adaptedHie = adaptedHie.replaceAll('R_.', 'p.');
adaptedHie = adaptedHie.replaceAll('hg(', 'wM(');
adaptedHie = adaptedHie.replaceAll('jt()', 'Vn()');
adaptedHie = adaptedHie.replaceAll('Ki()', 'JD()');
adaptedHie = adaptedHie.replaceAll('fg(', 'Zj(');
adaptedHie = adaptedHie.replaceAll('hT(', 'hM(');
adaptedHie = adaptedHie.replaceAll('Jgt(', 'TM(');
adaptedHie = adaptedHie.replaceAll('Br.', 'ls.');
adaptedHie = adaptedHie.replaceAll('Pr.', 'us.');
adaptedHie = adaptedHie.replaceAll('new Xs', 'new $j');

serverJs = replaceExact(serverJs, oldEm, adaptedHie, 'EM (generateVideoWithFFmpeg + intro/outro/circus/lowlights)');

// Server 10. fI (buildVideos)
const oldFi = `async function fI({signal:e,...t}){Yj(e);let{recordingSystem:n,recordingOutput:r,encoderSoftware:i,framerate:a,sequences:o,outputFolderPath:s,concatenateSequences:c,outputFileName:l,ffmpegSettings:u,game:d,onSequenceStart:f,onConcatenateSequencesStart:p}=t;for(let[t,c]of o.entries())f(c.number,t+1),i===ss.FFmpeg?await EM({ffmpegExecutablePath:aF(u.customExecutableLocation)?await HN():u.customExecutableLocation,recordingSystem:n,recordingOutput:r,game:d,recordAudio:c.recordAudio,audioBitrate:u.audioBitrate,constantRateFactor:u.constantRateFactor,videoContainer:u.videoContainer,videoCodec:u.videoCodec,audioCodec:u.audioCodec,inputParameters:u.inputParameters,outputParameters:u.outputParameters,framerate:a,outputFolderPath:s,sequence:c},e):await xM({recordingSystem:n,game:d,recordAudio:c.recordAudio,framerate:a,outputFolderPath:s,sequence:c},e);if(c&&o.length>1){p();let n=dI(l,{mapName:t.mapName,checksum:t.checksum,game:t.game,encoderSoftware:t.encoderSoftware,width:t.width,height:t.height,framerate:t.framerate});await OM({ffmpegExecutablePath:aF(u.customExecutableLocation)?await HN():u.customExecutableLocation,outputFolderPath:s,sequences:o,videoContainer:u.videoContainer,fileName:n},e)}}`;

let buildVideos = fs.readFileSync(path.join(patchesDir, 'server-buildvideos-patch.js'), 'utf8');

// Adapt buildVideos for 3.21.0:
buildVideos = buildVideos.replaceAll('I.selectFrom', 'Q.selectFrom');
buildVideos = buildVideos.replaceAll('I.updateTable', 'Q.updateTable');
buildVideos = buildVideos.replaceAll('y.Game', '$.Game');
buildVideos = buildVideos.replaceAll('await he()', 'await _s()');
buildVideos = buildVideos.replaceAll('Bs.FFmpeg', 'ss.FFmpeg');
buildVideos = buildVideos.replaceAll('Ks(u.customExecutableLocation)?await Bl():u.customExecutableLocation', 'aF(u.customExecutableLocation)?await HN():u.customExecutableLocation');
buildVideos = buildVideos.replaceAll('AIe({', 'xM({');
buildVideos = buildVideos.replaceAll('await hIe({', 'await EM({');
buildVideos = buildVideos.replaceAll('T_e(l,', 'dI(l,');
buildVideos = buildVideos.replaceAll('mIe({', 'OM({');
buildVideos = buildVideos.replace(/async function Ayt\(\{signal:t,\.\.\.e\}\)\{\s*yA\(t\);/, 'async function fI({signal:t,...e}){\n  Yj(t);\n  var Ayt = fI;');
if (!buildVideos.includes('async function fI(')) {
  throw new Error('Failed to adapt Ayt -> fI in server-buildvideos-patch.js');
}

serverJs = replaceExact(serverJs, oldFi, buildVideos, 'fI (buildVideos orchestration)');

fs.writeFileSync(serverJsPath, serverJs, 'utf8');
console.log('[apply-patches] server.js patched successfully!');

// ==========================================
// C. SYNTAX VALIDATION
// ==========================================
console.log('[apply-patches] Validating syntax...');
execSync(`node --check "${uiJsPath}"`);
console.log(`[apply-patches] ${uiJsFile} syntax check PASSED!`);
execSync(`node --check "${serverJsPath}"`);
console.log('[apply-patches] server.js syntax check PASSED!');
console.log('[apply-patches] SUCCESS: All patches applied and verified!');
