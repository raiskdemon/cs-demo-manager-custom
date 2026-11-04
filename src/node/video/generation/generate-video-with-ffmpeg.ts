import path from 'node:path';
import fs from 'fs-extra';
import { tmpdir } from 'node:os';
import { Game } from 'csdm/common/types/counter-strike';
import type { Sequence } from 'csdm/common/types/sequence';
import { getSequenceOutputFilePath } from 'csdm/node/video/generation/get-sequence-output-file-path';
import { getSequenceName } from 'csdm/node/video/generation/get-sequence-name';
import { getSequenceRawFiles } from 'csdm/node/video/generation/get-sequence-raw-files';
import { executeFfmpeg } from 'csdm/node/video/ffmpeg/execute-ffmpeg';
import type { VideoContainer } from 'csdm/common/types/video-container';
import { RecordingOutput } from 'csdm/common/types/recording-output';
import { RecordingSystem } from 'csdm/common/types/recording-system';
import { RawFilesNotFoundError } from '../errors/raw-files-not-found';
import { getStaticFolderPath } from 'csdm/node/filesystem/get-static-folder-path';
import type { HudOverlayPosition } from 'csdm/common/video/sequences/build-match-highlights-sequences';

function escapeFfmpegFilterPath(filePath: string) {
  return filePath.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function writeCleanTextFileSync(filePath: string, text: string) {
  const clean = String(text ?? '').replace(/[\r\n]/g, ' ').trim().replaceAll('%', '%%');
  fs.writeFileSync(filePath, clean, { encoding: 'utf8' });
}

function getWindowsFontPaths() {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const fontsDir = path.join(windir, 'Fonts');
  const boldCandidates = ['segoeuib.ttf', 'arialbd.ttf', 'tahomabd.ttf', 'segoeui.ttf', 'arial.ttf'];
  const monoCandidates = ['consolab.ttf', 'consola.ttf', 'courbd.ttf', 'lucon.ttf', 'segoeuib.ttf'];

  let boldFont = path.join(fontsDir, 'segoeuib.ttf');
  for (const candidate of boldCandidates) {
    const full = path.join(fontsDir, candidate);
    if (fs.existsSync(full)) {
      boldFont = full;
      break;
    }
  }

  let monoFont = boldFont;
  for (const candidate of monoCandidates) {
    const full = path.join(fontsDir, candidate);
    if (fs.existsSync(full)) {
      monoFont = full;
      break;
    }
  }

  return {
    boldFontEscaped: escapeFfmpegFilterPath(boldFont),
    monoFontEscaped: escapeFfmpegFilterPath(monoFont),
  };
}

function buildVideoEncoderArgs(videoCodec: string, constantRateFactor: number, outputParameters: string): string[] {
  const args: string[] = [`-c:v ${videoCodec}`];
  if (outputParameters !== '') {
    args.push(outputParameters);
    return args;
  }
  const codecLower = videoCodec.toLowerCase();
  if (codecLower.includes('nvenc')) {
    args.push(`-preset p4`, `-tune hq`, `-rc vbr`, `-cq ${constantRateFactor}`, `-b:v 0`, `-pix_fmt yuv420p`);
  } else if (codecLower.includes('amf')) {
    args.push(
      `-quality quality`,
      `-rc cqp`,
      `-qp_i ${constantRateFactor}`,
      `-qp_p ${constantRateFactor}`,
      `-pix_fmt yuv420p`,
    );
  } else if (codecLower.includes('qsv')) {
    args.push(`-preset medium`, `-global_quality ${constantRateFactor}`, `-pix_fmt yuv420p`);
  } else if (codecLower.includes('mf')) {
    const quality = Math.max(1, Math.min(100, Math.round((51 - constantRateFactor) * 2)));
    args.push(`-rate_control quality`, `-quality ${quality}`, `-pix_fmt yuv420p`);
  } else {
    args.push(`-pix_fmt yuv420p`, `-crf ${constantRateFactor}`);
  }
  return args;
}

async function convertGameAudioFile(
  ffmpegExecutablePath: string,
  wavFilePath: string,
  audioCodec: string,
  audioBitrate: number,
  signal: AbortSignal,
) {
  const codecs = [
    { name: 'mp3', ext: '.mp3' },
    { name: 'aac', ext: '.m4a' },
    { name: 'alac', ext: '.m4a' },
    { name: 'opus', ext: '.opus' },
    { name: 'flac', ext: '.flac' },
    { name: 'vorbis', ext: '.ogg' },
    { name: 'ac3', ext: '.ac3' },
  ];
  let extension = '.wav';
  for (const codec of codecs) {
    if (audioCodec.includes(codec.name)) {
      extension = codec.ext;
      break;
    }
  }

  const tmpFilePath = path.join(tmpdir(), `csdm-audio${extension}`);
  const args = [
    '-y',
    '-i',
    `"${wavFilePath}"`,
    '-acodec',
    audioCodec,
    '-b:a',
    `${audioBitrate}K`,
    `"${tmpFilePath}"`,
  ];

  await executeFfmpeg(ffmpegExecutablePath, args, signal);

  const audioFilePath = wavFilePath.replace(/\.wav$/, extension);
  await fs.move(tmpFilePath, audioFilePath, { overwrite: true });

  return audioFilePath;
}

export type IntroPlayerRow = {
  name: string;
  teamName: string;
  killCount: number;
  deathCount: number;
  assistCount: number;
  isBot?: boolean;
  steamId?: string;
};

export type GenerateIntroVideoSettings = {
  ffmpegExecutablePath: string;
  game: Game;
  mapName: string;
  matchDate?: Date | string;
  teamAName: string;
  teamAScore: number;
  teamBName: string;
  teamBScore: number;
  players: IntroPlayerRow[];
  width: number;
  height: number;
  framerate: number;
  outputFolderPath: string;
  videoContainer: VideoContainer;
  videoCodec: string;
  audioCodec: string;
  constantRateFactor: number;
  audioBitrate: number;
  outputParameters: string;
};

export async function generateIntroVideoWithFFmpeg(settings: GenerateIntroVideoSettings, signal: AbortSignal) {
  const {
    ffmpegExecutablePath,
    game,
    mapName,
    matchDate,
    teamAName,
    teamAScore,
    teamBName,
    teamBScore,
    players,
    width,
    height,
    framerate,
    outputFolderPath,
    videoContainer,
    videoCodec,
    constantRateFactor,
    audioBitrate,
    outputParameters,
  } = settings;

  const INTRO_DURATION = 8;
  await fs.ensureDir(outputFolderPath);
  const introOutputPath = path.join(outputFolderPath, `intro-0.${videoContainer}`);
  const tmpIntroDir = path.join(outputFolderPath, '.intro-tmp');
  await fs.ensureDir(tmpIntroDir);

  try {
    const staticDir = getStaticFolderPath();
    const gameFolder = game === Game.CSGO ? 'csgo' : 'cs2';
    const cleanMapName = (mapName || 'unknown').toLowerCase();
    const mapCandidates = [
      path.join(staticDir, 'images', 'maps', gameFolder, 'thumbnails', `${cleanMapName}.png`),
      path.join(staticDir, 'images', 'maps', 'csgo', 'thumbnails', `${cleanMapName}.png`),
      path.join(staticDir, 'images', 'maps', 'cs2', 'thumbnails', `${cleanMapName}.png`),
      path.join(staticDir, 'images', 'maps', 'thumbnail_unknown.png'),
    ];
    let mapImagePath = '';
    for (const candidate of mapCandidates) {
      if (await fs.pathExists(candidate)) {
        mapImagePath = candidate;
        break;
      }
    }

    const { boldFontEscaped, monoFontEscaped } = getWindowsFontPaths();
    const w = Math.max(1280, width || 1920);
    const h = Math.max(720, height || 1080);
    const sx = w / 1920;
    const sy = h / 1080;
    const rx = (v: number) => Math.round(v * sx);
    const ry = (v: number) => Math.round(v * sy);

    let dateStr = '';
    if (matchDate) {
      const d = new Date(matchDate);
      if (!Number.isNaN(d.getTime())) {
        dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      }
    }

    const humanPlayers = players.filter((p) => {
      if (p.isBot) return false;
      const sid = String(p.steamId ?? '');
      if (sid === '0' || (sid !== '' && sid.length <= 5)) return false;
      if (/^bot\b/i.test((p.name || '').trim())) return false;
      return true;
    });

    const sortByKda = (a: IntroPlayerRow, b: IntroPlayerRow) => {
      if (b.killCount !== a.killCount) return b.killCount - a.killCount;
      if (b.assistCount !== a.assistCount) return b.assistCount - a.assistCount;
      return a.deathCount - b.deathCount;
    };

    const teamAPlayers = humanPlayers.filter((p) => p.teamName === teamAName).sort(sortByKda).slice(0, 10);
    const teamBPlayers = humanPlayers.filter((p) => p.teamName === teamBName).sort(sortByKda).slice(0, 10);

    const formatPlayerRow = (p: IntroPlayerRow, idx: number) => {
      const cleanName = (p.name || 'Jogador').replace(/[\r\n\t]/g, ' ').trim().slice(0, 17).padEnd(18, ' ');
      const k = String(p.killCount ?? 0).padStart(3, ' ');
      const d = String(p.deathCount ?? 0).padStart(3, ' ');
      const a = String(p.assistCount ?? 0).padStart(3, ' ');
      const kd = ((p.killCount ?? 0) / Math.max(1, p.deathCount ?? 0)).toFixed(2).padStart(5, ' ');
      return `${String(idx + 1).padStart(2, '0')}. ${cleanName} ${k} / ${d} / ${a}  ${kd}`;
    };

    const writeTextFile = (name: string, content: string) => {
      const fpath = path.join(tmpIntroDir, name);
      writeCleanTextFileSync(fpath, content);
      return escapeFfmpegFilterPath(fpath);
    };

    const headerTitleText = dateStr
      ? `HIGHLIGHTS DA PARTIDA  •  MAPA: ${cleanMapName.toUpperCase()}  •  ${dateStr}`
      : `HIGHLIGHTS DA PARTIDA  •  MAPA: ${cleanMapName.toUpperCase()}`;
    const scoreText = `${teamAName || 'TIME A'}     ${teamAScore ?? 0}   x   ${teamBScore ?? 0}     ${teamBName || 'TIME B'}`;
    const playersLabel = (n: number) => `${n} JOGADOR${n === 1 ? '' : 'ES'}`;
    const teamATitle = `${(teamAName || 'TIME A').toUpperCase()} (${playersLabel(teamAPlayers.length)})`;
    const teamBTitle = `${(teamBName || 'TIME B').toUpperCase()} (${playersLabel(teamBPlayers.length)})`;
    const colsHeader = `#   JOGADOR              K /   D /   A    K/D`;
    const footerText = `CS DEMO MANAGER CUSTOM  •  KDA TOTAL DOS JOGADORES (INCLUINDO BOTS ASSUMIDOS)`;

    const headerTitleFile = writeTextFile('header.txt', headerTitleText);
    const scoreFile = writeTextFile('score.txt', scoreText);
    const teamATitleFile = writeTextFile('team_a_title.txt', teamATitle);
    const teamBTitleFile = writeTextFile('team_b_title.txt', teamBTitle);
    const colsHeaderFile = writeTextFile('cols_header.txt', colsHeader);
    const footerFile = writeTextFile('footer.txt', footerText);

    const maxRows = Math.max(teamAPlayers.length, teamBPlayers.length, 1);
    const rowFontSize = maxRows > 8 ? ry(19) : ry(21);
    const rowStep = maxRows > 8 ? ry(36) : ry(42);
    const rowStartY = ry(486);

    const filterParts: string[] = [
      `scale=${w}:${h}:force_original_aspect_ratio=increase`,
      `crop=${w}:${h}`,
      `setsar=1:1`,
      `gblur=sigma=18`,
      `eq=brightness=-0.38:saturation=0.8`,
      // Top Banner
      `drawbox=x=${rx(120)}:y=${ry(48)}:w=${rx(1680)}:h=${ry(100)}:color=0x0d131fe0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(145)}:w=${rx(1680)}:h=${ry(4)}:color=0xf59e0b@0.95:t=fill`,
      // Score Banner
      `drawbox=x=${rx(120)}:y=${ry(174)}:w=${rx(1680)}:h=${ry(148)}:color=0x111827e8:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(174)}:w=${rx(1680)}:h=${ry(148)}:color=0x374151@0.8:t=2`,
      // Team A Box
      `drawbox=x=${rx(120)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=0x0f172ae0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(352)}:w=${rx(815)}:h=${ry(56)}:color=0x1e3a8ae0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=0x3b82f6@0.7:t=2`,
      // Team B Box
      `drawbox=x=${rx(985)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=0x0f172ae0:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(352)}:w=${rx(815)}:h=${ry(56)}:color=0x7c2d12e0:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(352)}:w=${rx(815)}:h=${ry(560)}:color=0xf97316@0.7:t=2`,
      // Titles & Headers
      `drawtext=fontfile='${boldFontEscaped}':textfile='${headerTitleFile}':fontsize=${ry(34)}:fontcolor=0xfbbf24:x=(w-text_w)/2:y=${ry(82)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${scoreFile}':fontsize=${ry(56)}:fontcolor=white:x=(w-text_w)/2:y=${ry(222)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${teamATitleFile}':fontsize=${ry(25)}:fontcolor=0x93c5fd:x=${rx(150)}:y=${ry(368)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${teamBTitleFile}':fontsize=${ry(25)}:fontcolor=0xfdba74:x=${rx(1015)}:y=${ry(368)}`,
      `drawtext=fontfile='${monoFontEscaped}':textfile='${colsHeaderFile}':fontsize=${ry(20)}:fontcolor=0x9ca3af:x=${rx(150)}:y=${ry(432)}`,
      `drawtext=fontfile='${monoFontEscaped}':textfile='${colsHeaderFile}':fontsize=${ry(20)}:fontcolor=0x9ca3af:x=${rx(1015)}:y=${ry(432)}`,
      `drawbox=x=${rx(145)}:y=${ry(464)}:w=${rx(765)}:h=1:color=0x374151@0.9:t=fill`,
      `drawbox=x=${rx(1010)}:y=${ry(464)}:w=${rx(765)}:h=1:color=0x374151@0.9:t=fill`,
    ];

    for (let i = 0; i < teamAPlayers.length; i++) {
      const f = writeTextFile(`ta_${i}.txt`, formatPlayerRow(teamAPlayers[i], i));
      const y = rowStartY + i * rowStep;
      const color = i === 0 ? '0xfef08a' : 'white';
      filterParts.push(
        `drawtext=fontfile='${monoFontEscaped}':textfile='${f}':fontsize=${rowFontSize}:fontcolor=${color}:x=${rx(150)}:y=${y}`,
      );
    }

    for (let i = 0; i < teamBPlayers.length; i++) {
      const f = writeTextFile(`tb_${i}.txt`, formatPlayerRow(teamBPlayers[i], i));
      const y = rowStartY + i * rowStep;
      const color = i === 0 ? '0xfef08a' : 'white';
      filterParts.push(
        `drawtext=fontfile='${monoFontEscaped}':textfile='${f}':fontsize=${rowFontSize}:fontcolor=${color}:x=${rx(1015)}:y=${y}`,
      );
    }

    filterParts.push(
      `drawtext=fontfile='${boldFontEscaped}':textfile='${footerFile}':fontsize=${ry(20)}:fontcolor=0x9ca3af:x=(w-text_w)/2:y=${ry(965)}`,
      `fps=${framerate}`,
      `loop=loop=${framerate * INTRO_DURATION}:size=1:start=0`,
      `trim=duration=${INTRO_DURATION}`,
      `fade=t=in:st=0:d=0.6`,
      `fade=t=out:st=${(INTRO_DURATION - 0.6).toFixed(1)}:d=0.6`,
      `format=yuv420p`,
    );

    const filterScriptPath = path.join(tmpIntroDir, 'intro_filter.txt');
    await fs.writeFile(filterScriptPath, filterParts.join(','), 'utf8');

    const args: string[] = ['-y'];
    if (mapImagePath) {
      args.push(`-i "${mapImagePath}"`);
    } else {
      args.push(`-f lavfi -i "color=c=0x111827:s=${w}x${h}:r=${framerate}"`);
    }
    args.push(
      `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"`,
      `-filter_script:v "${filterScriptPath}"`,
      ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
      `-c:a aac`,
      `-b:a ${audioBitrate}K`,
      `-t ${INTRO_DURATION}`,
      `-shortest`,
      `-movflags +faststart`,
      `"${introOutputPath}"`,
    );

    await executeFfmpeg(ffmpegExecutablePath, args, signal);
    return introOutputPath;
  } finally {
    await fs.remove(tmpIntroDir).catch(() => {});
  }
}

export type OutroHighlightItem = {
  label: string;
  value: string;
};

export type FunPlayerAward = {
  steamId: string;
  playerName: string;
  trophy: string;
  badge: string;
  desc: string;
};

export type GenerateOutroVideoSettings = {
  ffmpegExecutablePath: string;
  game: Game;
  mapName: string;
  teamAName: string;
  teamAScore: number;
  teamBName: string;
  teamBScore: number;
  mvp: {
    name: string;
    teamName: string;
    killCount: number;
    deathCount: number;
    assistCount: number;
    kd: string;
    humanKills: number;
    botKills: number;
    hsRate: number;
  };
  highlights: OutroHighlightItem[];
  showFunAwards?: boolean;
  funAwards?: FunPlayerAward[];
  width: number;
  height: number;
  framerate: number;
  outputFolderPath: string;
  videoContainer: VideoContainer;
  videoCodec: string;
  audioCodec: string;
  constantRateFactor: number;
  audioBitrate: number;
  outputParameters: string;
};

export async function generateOutroVideoWithFFmpeg(settings: GenerateOutroVideoSettings, signal: AbortSignal) {
  const {
    ffmpegExecutablePath,
    game,
    mapName,
    teamAName,
    teamAScore,
    teamBName,
    teamBScore,
    mvp,
    highlights,
    showFunAwards = true,
    funAwards = [],
    width,
    height,
    framerate,
    outputFolderPath,
    videoContainer,
    videoCodec,
    constantRateFactor,
    audioBitrate,
    outputParameters,
  } = settings;

  const hasFun = Boolean(showFunAwards && funAwards && funAwards.length > 0);
  const OUTRO_DURATION = hasFun ? 7 : 5;
  await fs.ensureDir(outputFolderPath);
  const outroOutputPath = path.join(outputFolderPath, `outro-0.${videoContainer}`);
  const tmpOutroDir = path.join(outputFolderPath, '.outro-tmp');
  await fs.ensureDir(tmpOutroDir);

  try {
    const staticDir = getStaticFolderPath();
    const gameFolder = game === Game.CSGO ? 'csgo' : 'cs2';
    const cleanMapName = (mapName || 'unknown').toLowerCase();
    const mapCandidates = [
      path.join(staticDir, 'images', 'maps', gameFolder, 'thumbnails', `${cleanMapName}.png`),
      path.join(staticDir, 'images', 'maps', 'csgo', 'thumbnails', `${cleanMapName}.png`),
      path.join(staticDir, 'images', 'maps', 'cs2', 'thumbnails', `${cleanMapName}.png`),
      path.join(staticDir, 'images', 'maps', 'thumbnail_unknown.png'),
    ];
    let mapImagePath = '';
    for (const candidate of mapCandidates) {
      if (await fs.pathExists(candidate)) {
        mapImagePath = candidate;
        break;
      }
    }

    const { boldFontEscaped, monoFontEscaped } = getWindowsFontPaths();
    const w = Math.max(1280, width || 1920);
    const h = Math.max(720, height || 1080);
    const sx = w / 1920;
    const sy = h / 1080;
    const rx = (v: number) => Math.round(v * sx);
    const ry = (v: number) => Math.round(v * sy);

    const writeTextFile = (name: string, content: string) => {
      const fpath = path.join(tmpOutroDir, name);
      writeCleanTextFileSync(fpath, content);
      return escapeFfmpegFilterPath(fpath);
    };

    let winnerBanner = '';
    if (teamAScore > teamBScore) {
      winnerBanner = `VITORIA: ${(teamAName || 'TIME A').toUpperCase()} (${teamAScore} x ${teamBScore})  •  MAPA: ${cleanMapName.toUpperCase()}`;
    } else if (teamBScore > teamAScore) {
      winnerBanner = `VITORIA: ${(teamBName || 'TIME B').toUpperCase()} (${teamBScore} x ${teamAScore})  •  MAPA: ${cleanMapName.toUpperCase()}`;
    } else {
      winnerBanner = `EMPATE: ${(teamAName || 'TIME A').toUpperCase()} ${teamAScore} x ${teamBScore} ${(teamBName || 'TIME B').toUpperCase()}  •  MAPA: ${cleanMapName.toUpperCase()}`;
    }

    const bannerFile = writeTextFile('banner.txt', winnerBanner);
    const mvpTitleFile = writeTextFile('mvp_title.txt', 'MVP DA PARTIDA');
    const mvpNameFile = writeTextFile('mvp_name.txt', (mvp?.name || 'Jogador').toUpperCase());
    const mvpTeamFile = writeTextFile('mvp_team.txt', `TIME: ${(mvp?.teamName || 'EQUIPE').toUpperCase()}`);
    const mvpKdaFile = writeTextFile(
      'mvp_kda.txt',
      `KDA: ${mvp?.killCount ?? 0} / ${mvp?.deathCount ?? 0} / ${mvp?.assistCount ?? 0}  (K/D: ${mvp?.kd ?? '1.00'})`,
    );
    const mvpHumFile = writeTextFile('mvp_hum.txt', `• Kills em Jogadores Humanos: ${mvp?.humanKills ?? 0}`);
    const mvpBotFile = writeTextFile('mvp_bot.txt', `• Kills em Bots Assumidos: ${mvp?.botKills ?? 0}`);
    const mvpHsFile = writeTextFile('mvp_hs.txt', `• Taxa de Headshot: ${mvp?.hsRate ?? 0}%`);

    const destTitle = hasFun ? 'TROFEUS DA PARTIDA' : 'DESTAQUES DA PARTIDA';
    const destTitleFile = writeTextFile('dest_title.txt', destTitle);
    const footerFile = writeTextFile('footer.txt', 'CS DEMO MANAGER CUSTOM  •  OBRIGADO POR ASSISTIR!');

    const filterParts: string[] = [
      `scale=${w}:${h}:force_original_aspect_ratio=increase`,
      `crop=${w}:${h}`,
      `setsar=1:1`,
      `gblur=sigma=18`,
      `eq=brightness=-0.38:saturation=0.8`,
      // Top Victory Banner
      `drawbox=x=${rx(120)}:y=${ry(48)}:w=${rx(1680)}:h=${ry(100)}:color=0x0d131fe0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(145)}:w=${rx(1680)}:h=${ry(4)}:color=0xf59e0b@0.95:t=fill`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${bannerFile}':fontsize=${ry(34)}:fontcolor=0xfbbf24:x=(w-text_w)/2:y=${ry(82)}`,
      // Left MVP Card
      `drawbox=x=${rx(120)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=0x0f172ae8:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(180)}:w=${rx(815)}:h=${ry(58)}:color=0x1e3a8ae0:t=fill`,
      `drawbox=x=${rx(120)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=0x3b82f6@0.7:t=2`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpTitleFile}':fontsize=${ry(26)}:fontcolor=0xfbbf24:x=${rx(160)}:y=${ry(195)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpNameFile}':fontsize=${ry(38)}:fontcolor=0xfef08a:x=${rx(160)}:y=${ry(270)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpTeamFile}':fontsize=${ry(22)}:fontcolor=0x93c5fd:x=${rx(160)}:y=${ry(325)}`,
      `drawbox=x=${rx(160)}:y=${ry(370)}:w=${rx(735)}:h=1:color=0x374151@0.9:t=fill`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpKdaFile}':fontsize=${ry(26)}:fontcolor=white:x=${rx(160)}:y=${ry(400)}`,
      `drawbox=x=${rx(160)}:y=${ry(455)}:w=${rx(735)}:h=1:color=0x374151@0.9:t=fill`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpHumFile}':fontsize=${ry(23)}:fontcolor=0xe2e8f0:x=${rx(160)}:y=${ry(490)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpBotFile}':fontsize=${ry(23)}:fontcolor=0x94a3b8:x=${rx(160)}:y=${ry(550)}`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${mvpHsFile}':fontsize=${ry(23)}:fontcolor=0xfbbf24:x=${rx(160)}:y=${ry(610)}`,
      // Right Highlights / Fun Awards Card
      `drawbox=x=${rx(985)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=0x0f172ae8:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(180)}:w=${rx(815)}:h=${ry(58)}:color=0x7c2d12e0:t=fill`,
      `drawbox=x=${rx(985)}:y=${ry(180)}:w=${rx(815)}:h=${ry(735)}:color=0xf97316@0.7:t=2`,
      `drawtext=fontfile='${boldFontEscaped}':textfile='${destTitleFile}':fontsize=${ry(26)}:fontcolor=0xfbbf24:x=${rx(1025)}:y=${ry(195)}`,
    ];

    if (hasFun) {
      if (funAwards.length <= 5) {
        for (let idx = 0; idx < funAwards.length; idx++) {
          const item = funAwards[idx];
          const destY = ry(265) + idx * ry(115);
          const trophyFile = writeTextFile(`fa_t_${idx}.txt`, `${item.trophy} - ${item.playerName}`);
          const descFile = writeTextFile(`fa_d_${idx}.txt`, item.desc);
          filterParts.push(
            `drawtext=fontfile='${boldFontEscaped}':textfile='${trophyFile}':fontsize=${ry(22)}:fontcolor=0xfdba74:x=${rx(1025)}:y=${destY}`,
            `drawtext=fontfile='${monoFontEscaped}':textfile='${descFile}':fontsize=${ry(18)}:fontcolor=white:x=${rx(1045)}:y=${destY + ry(36)}`,
          );
          if (idx < funAwards.length - 1) {
            filterParts.push(`drawbox=x=${rx(1025)}:y=${destY + ry(85)}:w=${rx(735)}:h=1:color=0x374151@0.7:t=fill`);
          }
        }
      } else {
        // Up to 10 players in 2 neat sub-columns
        for (let idx = 0; idx < Math.min(10, funAwards.length); idx++) {
          const item = funAwards[idx];
          const col = Math.floor(idx / 5);
          const row = idx % 5;
          const colX = col === 0 ? rx(1015) : rx(1405);
          const rowY = ry(265) + row * ry(115);
          const badgeFile = writeTextFile(`fa_b_${idx}.txt`, item.badge);
          const nameFile = writeTextFile(`fa_n_${idx}.txt`, item.playerName);
          const descFile = writeTextFile(`fa_d_${idx}.txt`, item.desc);
          filterParts.push(
            `drawtext=fontfile='${boldFontEscaped}':textfile='${badgeFile}':fontsize=${ry(18)}:fontcolor=0xfdba74:x=${colX}:y=${rowY}`,
            `drawtext=fontfile='${boldFontEscaped}':textfile='${nameFile}':fontsize=${ry(17)}:fontcolor=0xfef08a:x=${colX}:y=${rowY + ry(28)}`,
            `drawtext=fontfile='${monoFontEscaped}':textfile='${descFile}':fontsize=${ry(14)}:fontcolor=white:x=${colX}:y=${rowY + ry(54)}`,
          );
          if (row < 4 && idx + 1 < funAwards.length) {
            filterParts.push(`drawbox=x=${colX}:y=${rowY + ry(92)}:w=${rx(365)}:h=1:color=0x374151@0.5:t=fill`);
          }
        }
      }
    } else {
      let destY = ry(270);
      const destItems = highlights && highlights.length > 0 ? highlights : [
        { label: '• MELHOR LANCE DA PARTIDA', value: 'Nenhum lance registrado' },
        { label: '• MAIOR K/D RATIO', value: 'N/A' },
        { label: '• MIRA DE OURO (HEADSHOT)', value: 'N/A' },
        { label: '• CLUTCHER DO JOGO', value: 'Nenhum clutch registrado' },
      ];

      for (let idx = 0; idx < destItems.length; idx++) {
        const item = destItems[idx];
        const lblF = writeTextFile(`hl_lbl_${idx}.txt`, item.label);
        const valF = writeTextFile(`hl_val_${idx}.txt`, item.value);
        filterParts.push(
          `drawtext=fontfile='${boldFontEscaped}':textfile='${lblF}':fontsize=${ry(23)}:fontcolor=0xfdba74:x=${rx(1025)}:y=${destY}`,
          `drawtext=fontfile='${monoFontEscaped}':textfile='${valF}':fontsize=${ry(21)}:fontcolor=white:x=${rx(1045)}:y=${destY + ry(36)}`,
        );
        destY += ry(96);
        if (idx < destItems.length - 1) {
          filterParts.push(`drawbox=x=${rx(1025)}:y=${destY - ry(20)}:w=${rx(735)}:h=1:color=0x374151@0.7:t=fill`);
        }
      }
    }

    filterParts.push(
      `drawtext=fontfile='${boldFontEscaped}':textfile='${footerFile}':fontsize=${ry(20)}:fontcolor=0x9ca3af:x=(w-text_w)/2:y=${ry(965)}`,
      `fps=${framerate}`,
      `loop=loop=${framerate * OUTRO_DURATION}:size=1:start=0`,
      `trim=duration=${OUTRO_DURATION}`,
      `fade=t=in:st=0:d=0.5`,
      `fade=t=out:st=${(OUTRO_DURATION - 0.5).toFixed(1)}:d=0.5`,
      `format=yuv420p`,
    );

    const filterScriptPath = path.join(tmpOutroDir, 'outro_filter.txt');
    await fs.writeFile(filterScriptPath, filterParts.join(','), 'utf8');

    const args: string[] = ['-y'];
    if (mapImagePath) {
      args.push(`-i "${mapImagePath}"`);
    } else {
      args.push(`-f lavfi -i "color=c=0x111827:s=${w}x${h}:r=${framerate}"`);
    }
    args.push(
      `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"`,
      `-filter_script:v "${filterScriptPath}"`,
      ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
      `-c:a aac`,
      `-b:a ${audioBitrate}K`,
      `-t ${OUTRO_DURATION}`,
      `-shortest`,
      `-movflags +faststart`,
      `"${outroOutputPath}"`,
    );

    await executeFfmpeg(ffmpegExecutablePath, args, signal);
    return outroOutputPath;
  } finally {
    await fs.remove(tmpOutroDir).catch(() => {});
  }
}

export type SequenceKillInfo = {
  id?: string | number;
  tick: number;
  roundNumber: number;
  killerSteamId?: string;
  killerName?: string;
  victimSteamId?: string;
  victimName?: string;
  weaponName?: string;
  weaponType?: string;
  isHeadshot?: boolean;
  isNoScope?: boolean;
  isThroughSmoke?: boolean;
  penetratedObjects?: number;
  isKillerControllingBot?: boolean;
};

export type SequenceClutchInfo = {
  roundNumber: number;
  tick?: number;
  clutcherSteamId?: string;
  clutcherName?: string;
  opponentCount: number;
  won: boolean;
};

export type GenerateVideoWithFFmpegSettings = {
  ffmpegExecutablePath: string;
  recordingSystem: RecordingSystem;
  recordingOutput: RecordingOutput;
  game: Game;
  outputFolderPath: string;
  framerate: number;
  targetFramerate?: number;
  tickrate?: number;
  videoContainer: VideoContainer;
  videoCodec: string;
  audioCodec: string;
  constantRateFactor: number;
  audioBitrate: number;
  sequence: Sequence;
  inputParameters: string;
  outputParameters: string;
  recordAudio: boolean;
  hudPosition?: HudOverlayPosition;
  enableSequenceTransitions?: boolean;
  enableKillCounter?: boolean;
  enableSlowMotion?: boolean;
  sequenceKills?: SequenceKillInfo[];
  clutches?: SequenceClutchInfo[];
};

function getKillBadge(count: number): string {
  switch (count) {
    case 1:
      return '1K';
    case 2:
      return '2K • DOUBLE KILL';
    case 3:
      return '3K • TRIPLE KILL';
    case 4:
      return '4K • QUADRA KILL';
    case 5:
      return '5K • ACE!';
    case 6:
      return '6K • SUPER KILL';
    case 7:
      return '7K • MONSTER KILL';
    case 8:
      return '8K • ULTRA KILL';
    case 9:
      return '9K • UNSTOPPABLE';
    case 10:
      return '10K • GODLIKE ACE';
    default:
      return `${count}K • MULTI KILL`;
  }
}

function getWeaponBadge(k: SequenceKillInfo): string {
  if (k.weaponType === 'knife') return ' • FACA';
  if (k.isNoScope) return ' • NO-SCOPE';
  if ((k.penetratedObjects ?? 0) >= 2) return ' • WALLBANG';
  if (k.isThroughSmoke) return ' • SMOKE';
  return '';
}

export async function generateVideoWithFFmpeg(settings: GenerateVideoWithFFmpegSettings, signal: AbortSignal) {
  logger.debug('Generating video with FFmpeg');
  logger.debug(settings);
  const { tgaFiles, wavFilePath, videoFilePath } = await getSequenceRawFiles(settings);

  const {
    ffmpegExecutablePath,
    framerate,
    targetFramerate,
    tickrate = 64,
    inputParameters,
    videoCodec,
    audioCodec,
    audioBitrate,
    constantRateFactor,
    outputParameters,
    recordingSystem,
    game,
    sequence,
    outputFolderPath,
    videoContainer,
    recordingOutput,
    recordAudio,
    hudPosition = 'top-left',
    enableSequenceTransitions = true,
    enableKillCounter = true,
    enableSlowMotion = true,
    sequenceKills = [],
    clutches = [],
  } = settings;

  const targetFps = targetFramerate || Math.min(framerate, 60);

  await fs.ensureDir(outputFolderPath);

  const outputPath = getSequenceOutputFilePath(outputFolderPath, sequence, videoContainer);
  const tmpHudDir = path.join(outputFolderPath, `.hud-tmp-${sequence.number}`);
  const rawSeqDuration = Math.max(0.5, (sequence.endTick - sequence.startTick) / Math.max(1, tickrate));

  const sortedCams = Array.isArray(sequence.playerCameras)
    ? [...sequence.playerCameras].sort((a, b) => a.tick - b.tick)
    : [];

  const kills = Array.isArray(sequenceKills)
    ? [...sequenceKills].sort((a, b) => a.tick - b.tick)
    : [];

  // Check for epic kill to trigger 0.5x slow-motion
  let slowMoInfo: { startSec: number; endSec: number; extraSec: number; epicKillTick: number } | null = null;
  if (enableSlowMotion !== false && kills.length > 0) {
    let bestEpic: SequenceKillInfo | null = null;
    let bestEpicScore = -1;

    for (const k of kills) {
      const isClutchWon = clutches.some(
        (c) => c.won && c.roundNumber === k.roundNumber && c.clutcherSteamId === k.killerSteamId,
      );
      let score = 0;
      if (k.isNoScope) score += 50;
      if (k.weaponType === 'knife') score += 60;
      if ((k.penetratedObjects ?? 0) >= 2) score += 40;
      if (isClutchWon && (clutches.find((c) => c.roundNumber === k.roundNumber)?.opponentCount ?? 0) >= 2) score += 45;

      if (score > bestEpicScore) {
        bestEpicScore = score;
        bestEpic = k;
      }
    }

    if (bestEpic && bestEpicScore > 0) {
      const kSec = (bestEpic.tick - sequence.startTick) / Math.max(1, tickrate);
      const sStart = Math.max(0.2, kSec - 0.5);
      const sEnd = Math.min(rawSeqDuration - 0.2, kSec + 1.0);
      if (sEnd - sStart >= 0.8) {
        const span = sEnd - sStart;
        slowMoInfo = {
          startSec: sStart,
          endSec: sEnd,
          extraSec: span,
          epicKillTick: bestEpic.tick,
        };
      }
    }
  }

  const hasSlowMo = Boolean(slowMoInfo);
  const extraDuration = slowMoInfo?.extraSec ?? 0;
  const seqDuration = rawSeqDuration + extraDuration;
  const fadeDur = Math.min(0.35, seqDuration / 4);
  const fadeOutStart = Math.max(0, seqDuration - fadeDur);

  const adjustTime = (t: number) => {
    if (!slowMoInfo) return t;
    if (t <= slowMoInfo.startSec) return t;
    if (t <= slowMoInfo.endSec) return slowMoInfo.startSec + (t - slowMoInfo.startSec) * 2;
    return t + slowMoInfo.extraSec;
  };

  const buildHudAndFilters = async () => {
    await fs.ensureDir(tmpHudDir);
    const { boldFontEscaped } = getWindowsFontPaths();
    const hudFilters: string[] = [];

    if (hudPosition && hudPosition !== 'none' && sortedCams.length > 0) {
      let intervalIdx = 0;
      for (let idx = 0; idx < sortedCams.length; idx++) {
        const cam = sortedCams[idx] as Sequence['playerCameras'][number] & { roundNumber?: number };
        const playerName = (cam.playerName || '').trim();
        if (!playerName) continue;

        const roundNum = cam.roundNumber ?? (sequence as Sequence & { roundNumber?: number }).roundNumber;
        const camStartTick = idx === 0 ? sequence.startTick : cam.tick;
        const camEndTick = idx < sortedCams.length - 1 ? sortedCams[idx + 1].tick : sequence.endTick;

        const camStartRaw = Math.max(0, (camStartTick - sequence.startTick) / Math.max(1, tickrate));
        const camEndRaw = idx < sortedCams.length - 1
          ? Math.max(camStartRaw + 0.1, (camEndTick - sequence.startTick) / Math.max(1, tickrate))
          : rawSeqDuration + 30;

        const camKills = kills.filter(
          (k) => k.killerSteamId === cam.playerSteamId && k.tick >= camStartTick && k.tick < camEndTick + 64,
        );

        type HudInterval = {
          rawStart: number;
          rawEnd: number;
          text: string;
          borderColor: string;
          borderWidth: number;
        };

        const intervals: HudInterval[] = [];
        const basePov = roundNum ? `POV: ${playerName} - Round ${roundNum}` : `POV: ${playerName}`;

        if (!enableKillCounter || camKills.length === 0) {
          intervals.push({
            rawStart: camStartRaw,
            rawEnd: camEndRaw,
            text: basePov,
            borderColor: '0x3b82f688',
            borderWidth: 2,
          });
        } else {
          // Intervals progressing with each kill
          const firstKillSec = (camKills[0].tick - sequence.startTick) / Math.max(1, tickrate);
          if (firstKillSec > camStartRaw + 0.05) {
            intervals.push({
              rawStart: camStartRaw,
              rawEnd: firstKillSec,
              text: basePov,
              borderColor: '0x3b82f688',
              borderWidth: 2,
            });
          }

          for (let kIdx = 0; kIdx < camKills.length; kIdx++) {
            const k = camKills[kIdx];
            const kCount = kIdx + 1;
            const kStartSec = (k.tick - sequence.startTick) / Math.max(1, tickrate);
            const kEndSec = kIdx < camKills.length - 1
              ? (camKills[kIdx + 1].tick - sequence.startTick) / Math.max(1, tickrate)
              : camEndRaw;

            let badge = getKillBadge(kCount) + getWeaponBadge(k);
            if (kIdx === camKills.length - 1) {
              const wonClutch = clutches.find(
                (c) => c.won && c.roundNumber === roundNum && c.clutcherSteamId === cam.playerSteamId && c.opponentCount >= 1,
              );
              if (wonClutch) {
                badge += ` [CLUTCH 1v${wonClutch.opponentCount} VENCIDO]`;
              }
            }

            const fullText = `${basePov}  |  ${badge}`;
            let bColor = '0x3b82f688';
            let bWidth = 2;
            if (kCount === 2 || kCount === 3) {
              bColor = '0xf59e0bcc';
              bWidth = 3;
            } else if (kCount >= 4) {
              bColor = '0xef4444cc';
              bWidth = 3;
            }

            intervals.push({
              rawStart: kStartSec,
              rawEnd: kEndSec,
              text: fullText,
              borderColor: bColor,
              borderWidth: bWidth,
            });
          }
        }

        for (const it of intervals) {
          const adjStart = adjustTime(it.rawStart);
          const adjEnd = adjustTime(it.rawEnd);
          const lblFile = path.join(tmpHudDir, `hud_${intervalIdx++}.txt`);
          writeCleanTextFileSync(lblFile, it.text);
          const escLbl = escapeFfmpegFilterPath(lblFile);

          const enExpr = `:enable='between(t,${adjStart.toFixed(2)},${adjEnd.toFixed(2)})'`;
          const boxW = Math.max(360, Math.min(1080, Math.round(it.text.length * 13.5 + 56)));
          const boxH = 54;
          let boxX = '36';
          let boxY = '36';
          let textX = '58';
          let textY = '51';

          if (hudPosition === 'bottom-left') {
            boxX = '36';
            boxY = `ih-${boxH + 36}`;
            textX = '58';
            textY = `h-${boxH + 21}`;
          } else if (hudPosition === 'bottom-right') {
            boxX = `iw-${boxW}-36`;
            boxY = `ih-${boxH + 36}`;
            textX = `w-${boxW}-14`;
            textY = `h-${boxH + 21}`;
          } else if (hudPosition === 'top-center') {
            boxX = `(iw-${boxW})/2`;
            boxY = '36';
            textX = `(w-${boxW})/2+22`;
            textY = '51';
          } else if (hudPosition === 'top-right') {
            boxX = `iw-${boxW}-36`;
            boxY = '36';
            textX = `w-${boxW}-14`;
            textY = '51';
          }

          hudFilters.push(
            `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=0x0d131fcc:t=fill${enExpr}`,
            `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${it.borderColor}:t=${it.borderWidth}${enExpr}`,
            `drawbox=x=${boxX}:y=${boxY}:w=6:h=${boxH}:color=0xf59e0b@1.0:t=fill${enExpr}`,
            `drawtext=fontfile='${boldFontEscaped}':textfile='${escLbl}':fontsize=23:fontcolor=white:shadowcolor=black@0.85:shadowx=2:shadowy=2:x=${textX}:y=${textY}${enExpr}`,
          );
        }
      }
    }

    return hudFilters;
  };

  try {
    const hudFilters = await buildHudAndFilters();

    if (hasSlowMo && slowMoInfo) {
      // Complex filtergraph with slow motion in video and audio
      const s1 = slowMoInfo.startSec.toFixed(3);
      const s2 = slowMoInfo.endSec.toFixed(3);
      const dur = rawSeqDuration.toFixed(3);

      const vBaseFilters = [
        `[0:v]trim=0:${s1},setpts=PTS-STARTPTS[vpre]`,
        `[0:v]trim=${s1}:${s2},setpts=2.0*(PTS-STARTPTS)[vslow]`,
        `[0:v]trim=${s2}:${dur},setpts=PTS-STARTPTS[vpost]`,
        `[vpre][vslow][vpost]concat=n=3:v=1:a=0[vcat]`,
      ];

      const vOutFilters = ['setsar=1:1', ...hudFilters];
      if (enableSequenceTransitions) {
        vOutFilters.push(
          `fade=t=in:st=0:d=${fadeDur.toFixed(2)}`,
          `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDur.toFixed(2)}`,
        );
      }
      vOutFilters.push(`fps=fps=${targetFps}`, 'format=yuv420p');

      const aBaseFilters = [
        `[1:a]atrim=0:${s1},asetpts=PTS-STARTPTS[apre]`,
        `[1:a]atrim=${s1}:${s2},asetpts=PTS-STARTPTS,atempo=0.5[aslow]`,
        `[1:a]atrim=${s2}:${dur},asetpts=PTS-STARTPTS[apost]`,
        `[apre][aslow][apost]concat=n=3:v=0:a=1[acat]`,
      ];

      const aOutFilters = [
        `aresample=async=1:first_pts=0`,
      ];
      if (enableSequenceTransitions) {
        aOutFilters.push(
          `afade=t=in:st=0:d=${fadeDur.toFixed(2)}`,
          `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDur.toFixed(2)}`,
        );
      }

      const fullComplex = [
        ...vBaseFilters,
        `[vcat]${vOutFilters.join(',')}[vout]`,
        ...aBaseFilters,
        `[acat]${aOutFilters.join(',')}[aout]`,
      ].join(';\n');

      const complexScriptPath = path.join(tmpHudDir, `filter_complex_${sequence.number}.txt`);
      await fs.writeFile(complexScriptPath, fullComplex, 'utf8');

      const args: string[] = ['-y', '-hwaccel auto'];
      if (inputParameters !== '') {
        args.push(inputParameters);
      }

      const hasAudio = Boolean(recordAudio && wavFilePath && (await fs.pathExists(wavFilePath)));
      if (recordingSystem === RecordingSystem.HLAE && recordingOutput === RecordingOutput.Video) {
        if (!videoFilePath) {
          throw new RawFilesNotFoundError();
        }
        args.push(`-i "${videoFilePath}"`);
      } else {
        let rawPattern: string;
        const sequenceRawFilesFolderPath = path.dirname(tgaFiles[0]);
        if (recordingSystem === RecordingSystem.HLAE) {
          rawPattern = path.join(sequenceRawFilesFolderPath, '%05d.tga');
        } else {
          const sequenceName = getSequenceName(sequence);
          rawPattern = path.join(
            sequenceRawFilesFolderPath,
            game === Game.CSGO ? `${sequenceName}%04d.tga` : `${sequenceName}%08d.tga`,
          );
        }
        args.push(`-framerate ${framerate}`, `-i "${rawPattern}"`);
      }

      if (hasAudio && wavFilePath) {
        args.push(`-i "${wavFilePath}"`);
      } else {
        args.push(`-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"`);
      }

      args.push(
        `-filter_complex_script "${complexScriptPath}"`,
        '-map "[vout]"',
        '-map "[aout]"',
        ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
        `-c:a aac`,
        `-b:a ${audioBitrate}K`,
        '-shortest',
        '-movflags +faststart',
        `"${outputPath}"`,
      );

      return await executeFfmpeg(ffmpegExecutablePath, args, signal);
    }

    // Standard path (no slow-motion)
    const vFilters: string[] = ['setsar=1:1', ...hudFilters];
    if (enableSequenceTransitions) {
      vFilters.push(
        `fade=t=in:st=0:d=${fadeDur.toFixed(2)}`,
        `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDur.toFixed(2)}`,
      );
    }
    vFilters.push(`fps=fps=${targetFps}`, 'format=yuv420p');

    const filterScriptPath = path.join(tmpHudDir, `filter_seq_${sequence.number}.txt`);
    await fs.writeFile(filterScriptPath, vFilters.join(','), 'utf8');

    const audioFadeFilter = enableSequenceTransitions
      ? `aresample=async=1:first_pts=0,afade=t=in:st=0:d=${fadeDur.toFixed(2)},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDur.toFixed(2)}`
      : `aresample=async=1:first_pts=0`;

    if (recordingSystem === RecordingSystem.HLAE && recordingOutput === RecordingOutput.Video) {
      if (!videoFilePath) {
        logger.error('Video file path is null for HLAE video output');
        throw new RawFilesNotFoundError();
      }

      const args: string[] = ['-y', '-hwaccel auto'];
      if (inputParameters !== '') {
        args.push(inputParameters);
      }
      args.push(`-i "${videoFilePath}"`);

      const hasAudio = Boolean(recordAudio && wavFilePath && (await fs.pathExists(wavFilePath)));
      if (hasAudio && wavFilePath) {
        if (videoContainer === 'mp4' || audioCodec.toLowerCase().includes('aac')) {
          args.push(
            `-i "${wavFilePath}"`,
            '-map 0:v:0',
            '-map 1:a:0',
            `-filter_script:v "${filterScriptPath}"`,
            ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
            '-c:a aac',
            `-b:a ${audioBitrate}K`,
            `-af "${audioFadeFilter}"`,
            '-shortest',
            '-movflags +faststart',
          );
        } else {
          const audioFilePath = await convertGameAudioFile(
            ffmpegExecutablePath,
            wavFilePath,
            audioCodec,
            audioBitrate,
            signal,
          );
          args.push(
            `-i "${audioFilePath}"`,
            '-map 0:v:0',
            '-map 1:a:0',
            `-filter_script:v "${filterScriptPath}"`,
            ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
            '-c:a copy',
            '-shortest',
          );
        }
      } else {
        args.push(
          `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"`,
          '-map 0:v:0',
          '-map 1:a:0',
          `-filter_script:v "${filterScriptPath}"`,
          ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
          '-c:a aac',
          `-b:a ${audioBitrate}K`,
          '-shortest',
          '-movflags +faststart',
        );
      }

      args.push(`"${outputPath}"`);
      return await executeFfmpeg(ffmpegExecutablePath, args, signal);
    }

    let rawFilesPathPattern: string;
    const sequenceRawFilesFolderPath = path.dirname(tgaFiles[0]);
    if (recordingSystem === RecordingSystem.HLAE) {
      rawFilesPathPattern = path.join(sequenceRawFilesFolderPath, '%05d.tga');
    } else {
      const sequenceName = getSequenceName(sequence);
      rawFilesPathPattern = path.join(
        sequenceRawFilesFolderPath,
        game === Game.CSGO ? `${sequenceName}%04d.tga` : `${sequenceName}%08d.tga`,
      );
    }

    const args: string[] = ['-y', '-hwaccel auto', `-framerate ${framerate}`];
    if (inputParameters !== '') {
      args.push(inputParameters);
    }
    args.push(`-i "${rawFilesPathPattern}"`);

    const wavFileExists = wavFilePath ? await fs.pathExists(wavFilePath) : false;
    const hasAudio = recordAudio && wavFileExists;
    if (hasAudio) {
      args.push(`-i "${wavFilePath}"`);
    }

    args.push(
      `-filter_script:v "${filterScriptPath}"`,
      ...buildVideoEncoderArgs(videoCodec, constantRateFactor, outputParameters),
    );

    if (hasAudio) {
      args.push(`-acodec ${audioCodec}`, `-b:a ${audioBitrate}K`, `-af "${audioFadeFilter}"`);
    }

    args.push(`"${outputPath}"`);
    await executeFfmpeg(ffmpegExecutablePath, args, signal);
  } finally {
    await fs.remove(tmpHudDir).catch(() => {});
  }
}
