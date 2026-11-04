import { Game } from 'csdm/common/types/counter-strike';
import { generateVideoWithVirtualDub } from 'csdm/node/video/generation/generate-video-with-virtual-dub';
import {
  generateIntroVideoWithFFmpeg,
  generateOutroVideoWithFFmpeg,
  generateVideoWithFFmpeg,
  type IntroPlayerRow,
  type OutroHighlightItem,
  type SequenceKillInfo,
  type SequenceClutchInfo,
  type FunPlayerAward,
} from 'csdm/node/video/generation/generate-video-with-ffmpeg';
import { concatenateVideosFromSequences } from 'csdm/node/video/generation/concatenate-videos-from-sequences';
import { createCsgoVideoJsonFile } from 'csdm/node/video/generation/create-csgo-video-json-file';
import { watchDemoWithHlae } from 'csdm/node/counter-strike/launcher/watch-demo-with-hlae';
import { isWindows } from 'csdm/node/os/is-windows';
import { killCounterStrikeProcesses } from 'csdm/node/counter-strike/kill-counter-strike-processes';
import { EncoderSoftware } from 'csdm/common/types/encoder-software';
import { killFfmpegProcess } from 'csdm/node/video/ffmpeg/kill-ffmpeg-process';
import { killVirtualDubProcess } from 'csdm/node/video/virtual-dub/kill-virtual-dub-process';
import { abortError, throwIfAborted } from 'csdm/node/errors/abort-error';
import { killHlaeProcess } from 'csdm/node/video/hlae/kill-hlae-process';
import { sleep } from 'csdm/common/sleep';
import { sortSequencesByStartTick } from 'csdm/common/video/sort-sequences-by-start-tick';
import { createCs2VideoJsonFile } from 'csdm/node/video/generation/create-cs2-video-json-file';
import { startCounterStrike } from 'csdm/node/counter-strike/launcher/start-counter-strike';
import { deleteJsonActionsFile } from 'csdm/node/counter-strike/json-actions-file/delete-json-actions-file';
import { moveStartMovieFilesToOutputFolder } from 'csdm/node/video/generation/move-startmovie-files-to-output-folder';
import type { Sequence } from 'csdm/common/types/sequence';
import type { FfmpegSettings } from 'csdm/node/settings/settings';
import { fetchMatchPlayersSlots } from 'csdm/node/database/match/fetch-match-players-slots';
import { assertVideoGenerationIsPossible } from './assert-video-generation-is-possible';
import { deleteSequencesRawFiles } from './delete-sequences-raw-files';
import { uninstallCounterStrikeServerPlugin } from 'csdm/node/counter-strike/launcher/cs-server-plugin';
import { RecordingSystem } from 'csdm/common/types/recording-system';
import { RecordingOutput } from 'csdm/common/types/recording-output';
import { moveHlaeRawFilesToOutputFolder } from './move-hlae-files-to-output-folder';
import { fetchCameras } from 'csdm/node/database/cameras/fetch-cameras';
import { getFfmpegExecutablePath } from '../ffmpeg/ffmpeg-location';
import { isBlankString } from 'csdm/common/string/is-empty-string';
import { DisplayMode } from 'csdm/common/types/display-mode';
import { replaceFilenamePlaceholders } from './replace-filename-placeholders';
import { db } from 'csdm/node/database/database';
import { getSettings } from 'csdm/node/settings/get-settings';
import type { HudOverlayPosition } from 'csdm/common/video/sequences/build-match-highlights-sequences';

export type Parameters = {
  videoId: string;
  checksum: string;
  game: Game;
  mapName: string;
  tickrate: number;
  recordingSystem: RecordingSystem;
  recordingOutput: RecordingOutput;
  encoderSoftware: EncoderSoftware;
  framerate: number;
  width: number;
  height: number;
  closeGameAfterRecording: boolean;
  concatenateSequences: boolean;
  outputFileName: string;
  trueView: boolean;
  ffmpegSettings: Omit<FfmpegSettings, 'customLocationEnabled'>;
  outputFolderPath: string;
  demoPath: string;
  sequences: Sequence[];
  signal: AbortSignal;
  hudPosition?: HudOverlayPosition;
  showIntroScreen?: boolean;
  showOutroScreen?: boolean;
  showFunAwards?: boolean;
  enableKillCounter?: boolean;
  enableSlowMotion?: boolean;
  enableSequenceTransitions?: boolean;
  onGameStart: () => void;
  onMoveFilesStart: () => void;
  onSequenceStart: (sequenceNumber: number, sequencePosition: number) => void;
  onConcatenateSequencesStart: () => void;
};

function computeFunPlayerAwards(
  players: Array<{ steamId: string; name: string; assistCount?: number }>,
  kills: Array<{
    killer_steam_id?: string | null;
    victim_steam_id?: string | null;
    weapon_name?: string | null;
    weapon_type?: string | null;
    is_headshot?: boolean | null;
    penetrated_objects?: number | null;
    is_through_smoke?: boolean | null;
    is_no_scope?: boolean | null;
    is_killer_blinded?: boolean | null;
    is_killer_airborne?: boolean | null;
    is_victim_blinded?: boolean | null;
    is_killer_controlling_bot?: boolean | null;
    is_trade_kill?: boolean | null;
  }>,
  clutches: Array<{ clutcher_steam_id?: string | null; won?: boolean | null }>,
  mapName?: string | null,
): FunPlayerAward[] {
  const cleanMap = (mapName || '').toLowerCase();
  const playerStats = players.map((p) => {
    const sid = String(p.steamId ?? '');
    const pKills = kills.filter((k) => String(k.killer_steam_id ?? '') === sid);
    const pDeaths = kills.filter((k) => String(k.victim_steam_id ?? '') === sid);
    const totalK = pKills.length;
    const totalD = pDeaths.length;
    const ast = p.assistCount ?? 0;
    const wb = pKills.filter((k) => Number(k.penetrated_objects ?? 0) > 0).length;
    const hs = pKills.filter((k) => Boolean(k.is_headshot)).length;
    const smk = pKills.filter((k) => Boolean(k.is_through_smoke)).length;
    const zeus = pKills.filter((k) => {
      const w = String(k.weapon_name ?? '').toLowerCase();
      return w.includes('taser') || w.includes('zeus');
    }).length;
    const knf = pKills.filter((k) => {
      const w = String(k.weapon_name ?? '').toLowerCase();
      return k.weapon_type === 'knife' || w.includes('knife') || w.includes('bayonet');
    }).length;
    const snp = pKills.filter((k) => {
      const w = String(k.weapon_name ?? '').toLowerCase();
      return k.weapon_type === 'sniper' || ['awp', 'ssg08', 'scar20', 'g3sg1'].includes(w);
    }).length;
    const ns = pKills.filter((k) => Boolean(k.is_no_scope)).length;
    const blnd = pKills.filter((k) => Boolean(k.is_killer_blinded)).length;
    const air = pKills.filter((k) => Boolean(k.is_killer_airborne)).length;
    const grn = pKills.filter((k) => {
      const w = String(k.weapon_name ?? '').toLowerCase();
      return k.weapon_type === 'grenade' || ['hegrenade', 'inferno', 'molotov'].includes(w);
    }).length;
    const bot = pKills.filter((k) => Boolean(k.is_killer_controlling_bot)).length;
    const trd = pKills.filter((k) => Boolean(k.is_trade_kill)).length;
    const clCount = clutches.filter((c) => String(c.clutcher_steam_id ?? '') === sid && c.won).length;
    const blndDeaths = pDeaths.filter((k) => Boolean(k.is_victim_blinded)).length;
    const hsPct = totalK > 0 ? Math.round((hs / totalK) * 100) : 0;
    const wbPct = totalK > 0 ? Math.round((wb / totalK) * 100) : 0;
    const snpPct = totalK > 0 ? Math.round((snp / totalK) * 100) : 0;

    return {
      player: p,
      sid,
      name: p.name || 'Jogador',
      totalK,
      totalD,
      ast,
      wb,
      wbPct,
      hs,
      hsPct,
      smk,
      zeus,
      knf,
      snp,
      snpPct,
      ns,
      blnd,
      air,
      grn,
      bot,
      trd,
      clCount,
      blndDeaths,
    };
  });

  type Candidate = {
    sid: string;
    name: string;
    award: { id: string; badge: string; title: string; desc: string };
    score: number;
  };

  const candidatePool: Candidate[] = [];
  for (const s of playerStats) {
    const cands: Array<{ id: string; badge: string; title: string; desc: string; score: number }> = [];

    // 1. Porta da Esperança
    if (s.wb >= 1) {
      const sc = s.wbPct >= 20 ? 110 + s.wb * 10 : 70 + s.wb * 8;
      const d = cleanMap.includes('dust')
        ? `${s.wb} kill(s) varando a porta da Dust II`
        : `${s.wb} kill(s) varando portas e paredes`;
      cands.push({ id: 'porta_esperanca', badge: 'Porta da Esperanca 🚪', title: 'Trofeu Porta da Esperanca 🚪', desc: d, score: sc });
    }

    // 2. Pikachu
    if (s.zeus >= 1) {
      cands.push({ id: 'pikachu', badge: 'Pikachu ⚡', title: 'Trofeu Pikachu ⚡', desc: `${s.zeus} choque(s) de alta voltagem no Zeus`, score: 120 + s.zeus * 20 });
    }

    // 3. Traíra
    if (s.knf >= 1) {
      cands.push({ id: 'traira', badge: 'Traira 🐟', title: 'Trofeu Traira 🐟', desc: `${s.knf} facada(s) traira pelas costas`, score: 115 + s.knf * 15 });
    }

    // 4. Bob Marley
    if (s.smk >= 1) {
      cands.push({ id: 'bob_marley', badge: 'Bob Marley 💨', title: 'Trofeu Bob Marley 💨', desc: `${s.smk} kill(s) na pura brisa dentro da smoke`, score: 95 + s.smk * 15 });
    }

    // 5. Cearense Lover
    if (s.hs >= 2 && s.hsPct >= 35) {
      cands.push({ id: 'cearense_lover', badge: 'Cearense Lover 🤕', title: 'Trofeu Cearense Lover 🤕', desc: `So na cabecinha: ${s.hsPct}% HS (${s.hs} tiros no coco)`, score: s.hsPct * 1.2 + s.hs * 2 });
    }

    // 6. Handicap
    if (s.snp >= 3 && s.snpPct >= 35) {
      cands.push({ id: 'handicap', badge: 'Handicap 💺', title: 'Trofeu Handicap 💺', desc: `So mata sentadinho: ${s.snp} kills de AWP/Sniper`, score: 80 + s.snp * 4 });
    }

    // 7. Pombo Cego
    if (s.blnd >= 1) {
      cands.push({ id: 'pombo_cego', badge: 'Pombo Cego 🕊️', title: 'Trofeu Pombo Cego 🕊️', desc: `${s.blnd} kill(s) no escuro total (100% cego)`, score: 90 + s.blnd * 12 });
    }

    // 8. Saci Pererê
    if (s.air >= 1) {
      cands.push({ id: 'saci_perere', badge: 'Saci Perere 🦘', title: 'Trofeu Saci Perere 🦘', desc: `${s.air} kill(s) voando pelo mapa no ar`, score: 85 + s.air * 12 });
    }

    // 9. Sem Mira (No-Scope)
    if (s.ns >= 1) {
      cands.push({ id: 'no_scope', badge: 'Sem Mira (No-Scope) 🎯', title: 'Trofeu Sem Mira 🎯', desc: `${s.ns} no-scope(s) de sniper a queima-roupa`, score: 85 + s.ns * 10 });
    }

    // 10. Churrasqueiro
    if (s.grn >= 1) {
      cands.push({ id: 'churrasqueiro', badge: 'Churrasqueiro 🔥', title: 'Trofeu Churrasqueiro 🔥', desc: `${s.grn} assado(s) na molotov ou HE`, score: 80 + s.grn * 10 });
    }

    // 11. Clutcher de Aço
    if (s.clCount >= 1) {
      cands.push({ id: 'clutcher', badge: 'Clutcher de Aco 🦾', title: 'Trofeu Clutcher de Aco 🦾', desc: `Gelo no sangue: venceu ${s.clCount} clutch(es)`, score: 100 + s.clCount * 20 });
    }

    // 12. Ladrão de Bot
    if (s.bot >= 1) {
      cands.push({ id: 'ladrao_bot', badge: 'Ladrao de Bot 🤖', title: 'Trofeu Ladrao de Bot 🤖', desc: `Assumiu o bot e fez ${s.bot} kills marotas`, score: 75 + s.bot * 10 });
    }

    // 13. Garçom da Rodada
    if (s.ast >= 2) {
      cands.push({ id: 'garcom', badge: 'Garcom da Rodada 🍽️', title: 'Trofeu Garcom da Rodada 🍽️', desc: `Serviu ${s.ast} assistencias de bandeja pro time`, score: 50 + s.ast * 8 });
    }

    // 14. Papador de Kill
    if (s.trd >= 2) {
      cands.push({ id: 'papador', badge: 'Papador de Kill 🦹', title: 'Trofeu Papador de Kill 🦹', desc: `Aproveitou a deixa: ${s.trd} trade kills miadas`, score: 55 + s.trd * 6 });
    }

    // 15. O Exterminador
    if (s.totalK >= 8) {
      cands.push({ id: 'exterminador', badge: 'O Exterminador 💀', title: 'Trofeu O Exterminador 💀', desc: `Maquina mortifera com ${s.totalK} abates`, score: s.totalK * 4 });
    }

    // 16. O Sobrevivente
    if (s.totalD <= 8) {
      cands.push({ id: 'sobrevivente', badge: 'O Sobrevivente 🐢', title: 'Trofeu O Sobrevivente 🐢', desc: `Escondidinho na base: so ${s.totalD} mortes`, score: (25 - s.totalD) * 3 });
    }

    // 17. Saco de Pancadas
    if (s.totalD >= 8) {
      cands.push({ id: 'saco_pancadas', badge: 'Saco de Pancadas 🥊', title: 'Trofeu Saco de Pancadas 🥊', desc: `Caiu de pe: tomou ${s.totalD} mortes com bravura`, score: 35 + s.totalD * 2 });
    }

    // 18. Óculos Escuros
    if (s.blndDeaths >= 1) {
      cands.push({ id: 'oculos_escuros', badge: 'Oculos Escuros 🕶️', title: 'Trofeu Oculos Escuros 🕶️', desc: `Nao viu de onde veio: morreu cego ${s.blndDeaths}x`, score: 40 + s.blndDeaths * 8 });
    }

    // 19. Mascote da Turma (Fallback)
    cands.push({ id: 'mascote', badge: 'Mascote da Turma 🥬', title: 'Trofeu Mascote da Turma 🥬', desc: 'Jogou com amor e garantiu a resenha no Discord', score: 10 });

    for (const c of cands) {
      candidatePool.push({ sid: s.sid, name: s.name, award: c, score: c.score });
    }
  }

  candidatePool.sort((a, b) => b.score - a.score);
  const assignedPlayers = new Set<string>();
  const assignedTrophies = new Set<string>();
  const finalAwards: FunPlayerAward[] = [];

  for (const cand of candidatePool) {
    if (!assignedPlayers.has(cand.sid) && !assignedTrophies.has(cand.award.id)) {
      assignedPlayers.add(cand.sid);
      assignedTrophies.add(cand.award.id);
      finalAwards.push({
        steamId: cand.sid,
        playerName: cand.name,
        trophy: cand.award.title,
        badge: cand.award.badge,
        desc: cand.award.desc,
      });
    }
  }

  for (const s of playerStats) {
    if (!assignedPlayers.has(s.sid)) {
      finalAwards.push({
        steamId: s.sid,
        playerName: s.name,
        trophy: 'Trofeu Mascote da Turma 🥬',
        badge: 'Mascote da Turma 🥬',
        desc: 'Jogou com amor e garantiu a resenha no Discord',
      });
      assignedPlayers.add(s.sid);
    }
  }

  return finalAwards;
}

async function fetchMatchIntroAndHudContext(checksum: string) {
  try {
    const [demoRow, teamRows, playerRows, roundRows, killRows, clutchRows] = await Promise.all([
      db.selectFrom('demos').select(['date', 'map_name']).where('checksum', '=', checksum).executeTakeFirst(),
      db
        .selectFrom('teams')
        .select(['name', 'score', 'letter'])
        .where('match_checksum', '=', checksum)
        .orderBy('letter', 'asc')
        .execute(),
      db
        .selectFrom('players')
        .select(['steam_id', 'name', 'team_name', 'kill_count', 'death_count', 'assist_count'])
        .where('match_checksum', '=', checksum)
        .execute(),
      db
        .selectFrom('rounds')
        .select(['number', 'start_tick', 'end_tick'])
        .where('match_checksum', '=', checksum)
        .orderBy('number', 'asc')
        .execute(),
      db
        .selectFrom('kills')
        .select([
          'id',
          'tick',
          'round_number',
          'killer_steam_id',
          'killer_name',
          'killer_team_name',
          'victim_steam_id',
          'victim_name',
          'victim_team_name',
          'assister_steam_id',
          'assister_team_name',
          'weapon_name',
          'weapon_type',
          'is_headshot',
          'is_no_scope',
          'is_through_smoke',
          'penetrated_objects',
          'is_killer_controlling_bot',
          'is_killer_airborne',
          'is_killer_blinded',
          'is_victim_blinded',
          'is_trade_kill',
          'distance',
        ])
        .where('match_checksum', '=', checksum)
        .orderBy('tick', 'asc')
        .execute(),
      db
        .selectFrom('clutches')
        .select(['round_number', 'tick', 'clutcher_steam_id', 'clutcher_name', 'opponent_count', 'won'])
        .where('match_checksum', '=', checksum)
        .execute()
        .catch(() => []),
    ]);

    const isHumanId = (id?: string) => {
      const s = String(id ?? '');
      return s !== '' && s !== '0' && s.length > 5;
    };

    const humanKillsByPlayer = new Map<string, number>();
    const botKillsByPlayer = new Map<string, number>();
    const headshotsByPlayer = new Map<string, number>();
    const killsByPlayer = new Map<string, number>();
    const deathsByPlayer = new Map<string, number>();
    const assistsByPlayer = new Map<string, number>();

    for (const k of killRows) {
      const killerId = String(k.killer_steam_id ?? '');
      const victimId = String(k.victim_steam_id ?? '');
      const assisterId = String(k.assister_steam_id ?? '');
      if (
        killerId &&
        killerId !== '0' &&
        killerId !== victimId &&
        (!k.killer_team_name || !k.victim_team_name || k.killer_team_name !== k.victim_team_name)
      ) {
        killsByPlayer.set(killerId, (killsByPlayer.get(killerId) ?? 0) + 1);
        if (isHumanId(victimId) && !/^bot\b/i.test(k.victim_name || '')) {
          humanKillsByPlayer.set(killerId, (humanKillsByPlayer.get(killerId) ?? 0) + 1);
        } else {
          botKillsByPlayer.set(killerId, (botKillsByPlayer.get(killerId) ?? 0) + 1);
        }
        if (k.is_headshot) {
          headshotsByPlayer.set(killerId, (headshotsByPlayer.get(killerId) ?? 0) + 1);
        }
      }
      if (victimId && victimId !== '0') {
        deathsByPlayer.set(victimId, (deathsByPlayer.get(victimId) ?? 0) + 1);
      }
      if (
        assisterId &&
        assisterId !== '0' &&
        (!k.assister_team_name || !k.victim_team_name || k.assister_team_name !== k.victim_team_name)
      ) {
        assistsByPlayer.set(assisterId, (assistsByPlayer.get(assisterId) ?? 0) + 1);
      }
    }

    const teamA = teamRows[0] ?? { name: 'Time A', score: 0 };
    const teamB = teamRows[1] ?? { name: 'Time B', score: 0 };
    const players: IntroPlayerRow[] = playerRows.map((p) => {
      const sid = String(p.steam_id ?? '');
      return {
        steamId: sid,
        name: p.name,
        teamName: p.team_name,
        killCount: Math.max(Number(p.kill_count ?? 0), killsByPlayer.get(sid) ?? 0),
        deathCount: Math.max(Number(p.death_count ?? 0), deathsByPlayer.get(sid) ?? 0),
        assistCount: Math.max(Number(p.assist_count ?? 0), assistsByPlayer.get(sid) ?? 0),
        isBot: false,
      };
    });

    const humanPlayersWithStats = playerRows
      .filter((p) => isHumanId(p.steam_id) && !/^bot\b/i.test(p.name || ''))
      .map((p) => {
        const sid = String(p.steam_id ?? '');
        const k = Math.max(Number(p.kill_count ?? 0), killsByPlayer.get(sid) ?? 0);
        const d = Math.max(Number(p.death_count ?? 0), deathsByPlayer.get(sid) ?? 0);
        const a = Math.max(Number(p.assist_count ?? 0), assistsByPlayer.get(sid) ?? 0);
        const humK = humanKillsByPlayer.get(sid) ?? Math.round(k * 0.75);
        const botK = botKillsByPlayer.get(sid) ?? Math.max(0, k - humK);
        const hs = headshotsByPlayer.get(sid) ?? 0;
        const kd = (k / Math.max(1, d)).toFixed(2);
        const hsRate = Math.round((hs / Math.max(1, k)) * 100);
        const mvpScore = k * 2 + a - d;
        return {
          steamId: sid,
          name: p.name,
          teamName: p.team_name,
          killCount: k,
          deathCount: d,
          assistCount: a,
          kd,
          humanKills: humK,
          botKills: botK,
          hsRate,
          hsCount: hs,
          mvpScore,
        };
      });

    humanPlayersWithStats.sort((a, b) => (b.mvpScore !== a.mvpScore ? b.mvpScore - a.mvpScore : b.killCount - a.killCount));
    const topMvp = humanPlayersWithStats[0] ?? {
      name: 'Jogador',
      teamName: 'Equipe',
      killCount: 0,
      deathCount: 0,
      assistCount: 0,
      kd: '1.00',
      humanKills: 0,
      botKills: 0,
      hsRate: 0,
    };

    const topKdPlayer = [...humanPlayersWithStats].sort((a, b) => parseFloat(b.kd) - parseFloat(a.kd))[0];
    const topHsPlayer = [...humanPlayersWithStats].sort((a, b) => b.hsRate - a.hsRate)[0];
    const wonClutches = ((clutchRows as unknown[]) as Array<{
      round_number: number;
      clutcher_steam_id?: string;
      clutcher_name?: string;
      opponent_count: number;
      won: boolean;
    }>).filter((c) => c.won && isHumanId(c.clutcher_steam_id));
    wonClutches.sort((a, b) => b.opponent_count - a.opponent_count);
    const bestClutch = wonClutches[0];

    const outroHighlights: OutroHighlightItem[] = [
      {
        label: '• MELHOR JOGADOR (MVP)',
        value: `${topMvp.name} (${topMvp.killCount} Kills, ${topMvp.kd} K/D)`,
      },
      {
        label: '• MAIOR K/D RATIO',
        value: topKdPlayer ? `${topKdPlayer.name} - ${topKdPlayer.kd} K/D (${topKdPlayer.killCount} Kills)` : 'N/A',
      },
      {
        label: '• MIRA DE OURO (HEADSHOT)',
        value: topHsPlayer ? `${topHsPlayer.name} - ${topHsPlayer.hsRate}% Headshots (${topHsPlayer.hsCount} HS)` : 'N/A',
      },
      {
        label: '• CLUTCHER DO JOGO',
        value: bestClutch
          ? `${bestClutch.clutcher_name || 'Jogador'} - Clutch 1v${bestClutch.opponent_count} Vencido (Round ${bestClutch.round_number})`
          : 'Nenhum clutch vencido na partida',
      },
    ];

    return {
      matchDate: demoRow?.date,
      mapName: demoRow?.map_name || '',
      teamAName: teamA.name,
      teamAScore: Number(teamA.score ?? 0),
      teamBName: teamB.name,
      teamBScore: Number(teamB.score ?? 0),
      players,
      rounds: roundRows.map((r) => ({
        number: Number(r.number),
        startTick: Number(r.start_tick),
        endTick: Number(r.end_tick),
      })),
      kills: killRows.map((k) => ({
        id: k.id,
        tick: Number(k.tick),
        roundNumber: Number(k.round_number),
        killerSteamId: k.killer_steam_id ?? undefined,
        killerName: k.killer_name ?? undefined,
        killerTeamName: k.killer_team_name ?? undefined,
        victimSteamId: k.victim_steam_id ?? undefined,
        victimName: k.victim_name ?? undefined,
        victimTeamName: k.victim_team_name ?? undefined,
        weaponName: k.weapon_name ?? undefined,
        weaponType: k.weapon_type ?? undefined,
        isHeadshot: Boolean(k.is_headshot),
        isNoScope: Boolean(k.is_no_scope),
        isThroughSmoke: Boolean(k.is_through_smoke),
        penetratedObjects: Number(k.penetrated_objects ?? 0),
        isKillerControllingBot: Boolean(k.is_killer_controlling_bot),
      })),
      clutches: (((clutchRows as unknown[]) as any[]) || []).map((c) => ({
        roundNumber: Number(c.round_number),
        tick: Number(c.tick ?? 0),
        clutcherSteamId: c.clutcher_steam_id ?? undefined,
        clutcherName: c.clutcher_name ?? undefined,
        opponentCount: Number(c.opponent_count ?? 1),
        won: Boolean(c.won),
      })),
      mvp: topMvp,
      highlights: outroHighlights,
      funAwards: computeFunPlayerAwards(humanPlayersWithStats, killRows, clutchRows, demoRow?.map_name),
    };
  } catch (error) {
    logger.error('Failed to fetch match context for video intro/HUD/outro', error);
    return undefined;
  }
}

async function buildVideos({ signal, ...options }: Parameters) {
  throwIfAborted(signal);

  const {
    checksum,
    recordingSystem,
    recordingOutput,
    encoderSoftware,
    framerate,
    tickrate,
    width,
    height,
    mapName,
    sequences,
    outputFolderPath,
    concatenateSequences,
    outputFileName,
    ffmpegSettings,
    game,
    onSequenceStart,
    onConcatenateSequencesStart,
  } = options;

  const settings = await getSettings();
  const videoSettingsAny = settings.video as unknown as {
    hudPosition?: HudOverlayPosition;
    showIntroScreen?: boolean;
    showOutroScreen?: boolean;
    showFunAwards?: boolean;
    enableKillCounter?: boolean;
    enableSlowMotion?: boolean;
    enableSequenceTransitions?: boolean;
  };
  const hudPosition: HudOverlayPosition = options.hudPosition ?? videoSettingsAny.hudPosition ?? 'top-left';
  const showIntroScreen: boolean = options.showIntroScreen ?? videoSettingsAny.showIntroScreen ?? true;
  const showOutroScreen: boolean = options.showOutroScreen ?? videoSettingsAny.showOutroScreen ?? true;
  const showFunAwards: boolean = options.showFunAwards ?? videoSettingsAny.showFunAwards ?? true;
  const enableKillCounter: boolean = options.enableKillCounter ?? videoSettingsAny.enableKillCounter ?? true;
  const enableSlowMotion: boolean = options.enableSlowMotion ?? videoSettingsAny.enableSlowMotion ?? true;
  const enableSequenceTransitions: boolean =
    options.enableSequenceTransitions ?? videoSettingsAny.enableSequenceTransitions ?? true;

  const targetFramerate = framerate;
  const captureFramerate = enableSlowMotion ? Math.max(targetFramerate * 2, 120) : targetFramerate;

  const matchContext = await fetchMatchIntroAndHudContext(checksum);
  if (matchContext) {
    for (const seq of sequences) {
      for (const cam of seq.playerCameras) {
        const camAny = cam as Sequence['playerCameras'][number] & { roundNumber?: number };
        if (!camAny.playerName && camAny.playerSteamId) {
          const foundPlayer = matchContext.players.find((p) => p.steamId === camAny.playerSteamId);
          if (foundPlayer) {
            camAny.playerName = foundPlayer.name;
          }
        }
        if (!camAny.roundNumber) {
          const tickToMatch = camAny.tick || seq.startTick;
          const foundRound = matchContext.rounds.find(
            (r) => tickToMatch >= r.startTick - 256 && tickToMatch <= r.endTick + 256,
          );
          if (foundRound) {
            camAny.roundNumber = foundRound.number;
          }
        }
      }
    }
  }

  const ffmpegExecutablePath = !isBlankString(ffmpegSettings.customExecutableLocation)
    ? ffmpegSettings.customExecutableLocation
    : await getFfmpegExecutablePath();

  const completedSequences: Sequence[] = [];
  let lastError: unknown;

  for (const [index, sequence] of sequences.entries()) {
    onSequenceStart(sequence.number, index + 1);
    try {
      if (encoderSoftware === EncoderSoftware.FFmpeg) {
        const seqKills: SequenceKillInfo[] = (matchContext?.kills ?? []).filter(
          (k) => k.tick >= sequence.startTick && k.tick <= sequence.endTick,
        );
        const seqClutches: SequenceClutchInfo[] = (matchContext?.clutches ?? []).filter(
          (c) => seqKills.some((k) => k.roundNumber === c.roundNumber && k.killerSteamId === c.clutcherSteamId),
        );

        await generateVideoWithFFmpeg(
          {
            ffmpegExecutablePath,
            recordingSystem,
            recordingOutput,
            game,
            recordAudio: sequence.recordAudio,
            audioBitrate: ffmpegSettings.audioBitrate,
            constantRateFactor: ffmpegSettings.constantRateFactor,
            videoContainer: ffmpegSettings.videoContainer,
            videoCodec: ffmpegSettings.videoCodec,
            audioCodec: ffmpegSettings.audioCodec,
            inputParameters: ffmpegSettings.inputParameters,
            outputParameters: ffmpegSettings.outputParameters,
            framerate: captureFramerate,
            targetFramerate,
            tickrate,
            outputFolderPath,
            sequence,
            hudPosition,
            enableSequenceTransitions,
            enableKillCounter,
            enableSlowMotion,
            sequenceKills: seqKills,
            clutches: seqClutches,
          },
          signal,
        );
      } else {
        await generateVideoWithVirtualDub(
          {
            recordingSystem,
            game,
            recordAudio: sequence.recordAudio,
            framerate: captureFramerate,
            targetFramerate,
            outputFolderPath,
            sequence,
          },
          signal,
        );
      }
      completedSequences.push(sequence);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      logger.error(`Failed to convert sequence ${sequence.number}`, error);
      lastError = error;
    }
  }

  if (completedSequences.length === 0 && lastError) {
    throw lastError;
  }

  let introVideoPath: string | undefined;
  if (showIntroScreen && encoderSoftware === EncoderSoftware.FFmpeg && completedSequences.length > 0 && matchContext) {
    try {
      introVideoPath = await generateIntroVideoWithFFmpeg(
        {
          ffmpegExecutablePath,
          game,
          mapName: matchContext.mapName || mapName,
          matchDate: matchContext.matchDate,
          teamAName: matchContext.teamAName,
          teamAScore: matchContext.teamAScore,
          teamBName: matchContext.teamBName,
          teamBScore: matchContext.teamBScore,
          players: matchContext.players,
          width,
          height,
          framerate,
          outputFolderPath,
          videoContainer: ffmpegSettings.videoContainer,
          videoCodec: ffmpegSettings.videoCodec,
          audioCodec: ffmpegSettings.audioCodec,
          constantRateFactor: ffmpegSettings.constantRateFactor,
          audioBitrate: ffmpegSettings.audioBitrate,
          outputParameters: ffmpegSettings.outputParameters,
        },
        signal,
      );
    } catch (error) {
      logger.error('Failed to generate 8s intro video, continuing with sequences', error);
    }
  }

  let outroVideoPath: string | undefined;
  if (showOutroScreen && encoderSoftware === EncoderSoftware.FFmpeg && completedSequences.length > 0 && matchContext) {
    try {
      outroVideoPath = await generateOutroVideoWithFFmpeg(
        {
          ffmpegExecutablePath,
          game,
          mapName: matchContext.mapName || mapName,
          teamAName: matchContext.teamAName,
          teamAScore: matchContext.teamAScore,
          teamBName: matchContext.teamBName,
          teamBScore: matchContext.teamBScore,
          mvp: matchContext.mvp,
          highlights: matchContext.highlights,
          showFunAwards,
          funAwards: matchContext.funAwards,
          width,
          height,
          framerate,
          outputFolderPath,
          videoContainer: ffmpegSettings.videoContainer,
          videoCodec: ffmpegSettings.videoCodec,
          audioCodec: ffmpegSettings.audioCodec,
          constantRateFactor: ffmpegSettings.constantRateFactor,
          audioBitrate: ffmpegSettings.audioBitrate,
          outputParameters: ffmpegSettings.outputParameters,
        },
        signal,
      );
    } catch (error) {
      logger.error('Failed to generate 5s outro video, continuing with sequences', error);
    }
  }

  const shouldConcatenate =
    (concatenateSequences || Boolean(introVideoPath) || Boolean(outroVideoPath)) && completedSequences.length > 0;
  if (shouldConcatenate) {
    onConcatenateSequencesStart();
    const processedFileName = replaceFilenamePlaceholders(outputFileName, {
      mapName: options.mapName,
      checksum: options.checksum,
      game: options.game,
      encoderSoftware: options.encoderSoftware,
      width: options.width,
      height: options.height,
      framerate: options.framerate,
    });
    await concatenateVideosFromSequences(
      {
        ffmpegExecutablePath,
        outputFolderPath,
        sequences: completedSequences,
        videoContainer: ffmpegSettings.videoContainer,
        fileName: processedFileName,
        introVideoPath,
        outroVideoPath,
      },
      signal,
    );
  }
}

export async function generateVideo(parameters: Parameters) {
  logger.debug('Generating video with parameters:');
  logger.debug(parameters);

  const {
    checksum,
    videoId,
    recordingSystem,
    recordingOutput,
    encoderSoftware,
    framerate,
    demoPath,
    width,
    height,
    closeGameAfterRecording,
    tickrate,
    game,
    ffmpegSettings,
    outputFolderPath,
    trueView,
    signal,
    onMoveFilesStart,
  } = parameters;

  await assertVideoGenerationIsPossible(parameters);

  const outputDirectory = outputFolderPath;
  const isVideoGenerationAborted = () => {
    return signal.aborted;
  };

  const sequences = sortSequencesByStartTick(parameters.sequences);
  const deleteRawFiles = async () => {
    await deleteSequencesRawFiles({
      outputFolderPath,
      sequences,
      recordingSystem,
      game,
    });
  };

  const videoSettingsObj = (await getSettings()).video as unknown as { enableSlowMotion?: boolean };
  const enSlowCapture = parameters.enableSlowMotion ?? videoSettingsObj.enableSlowMotion ?? true;
  const captureFramerate = enSlowCapture ? Math.max(framerate * 2, 120) : framerate;

  if (recordingSystem === RecordingSystem.CounterStrike) {
    try {
      await deleteJsonActionsFile();
      const settings = await getSettings();
      const players = await fetchMatchPlayersSlots(checksum);
      const cameras = await fetchCameras();
      if (game === Game.CSGO) {
        await createCsgoVideoJsonFile({
          type: 'record',
          recordingSystem,
          recordingOutput,
          encoderSoftware,
          framerate: captureFramerate,
          demoPath,
          sequences,
          closeGameAfterRecording,
          tickrate,
          outputFolderPath,
          ffmpegSettings,
        });
      } else {
        await createCs2VideoJsonFile({
          type: 'record',
          recordingSystem,
          recordingOutput,
          encoderSoftware,
          framerate: captureFramerate,
          demoPath,
          sequences,
          closeGameAfterRecording,
          tickrate,
          outputFolderPath,
          players,
          cameras,
          trueView,
          ffmpegSettings,
        });
      }

      await startCounterStrike({
        demoPath,
        game,
        width,
        height,
        displayMode: DisplayMode.Windowed,
        onError: async () => {
          await deleteJsonActionsFile();
          await deleteRawFiles();
        },
      });

      onMoveFilesStart();
      if (recordingOutput === RecordingOutput.TakeScreenshots) {
        await moveStartMovieFilesToOutputFolder({
          outputFolderPath,
          sequences,
          game,
        });
      }

      await buildVideos(parameters);
    } catch (error) {
      if (isVideoGenerationAborted()) {
        throw abortError;
      }
      throw error;
    } finally {
      await deleteRawFiles();
      await deleteJsonActionsFile();
      if (isWindows) {
        await killCounterStrikeProcesses();
      }
      await uninstallCounterStrikeServerPlugin(game);
    }
  } else {
    try {
      const settings = await getSettings();
      const isHlaeVideoOutput = recordingOutput === RecordingOutput.Video;
      if (isHlaeVideoOutput) {
        await assertHlaeSupportsVideoOutput();
      }

      if (game === Game.CSGO) {
        await createCsgoVideoJsonFile({
          type: 'record',
          recordingSystem,
          recordingOutput,
          encoderSoftware,
          framerate: captureFramerate,
          demoPath,
          sequences,
          closeGameAfterRecording,
          tickrate,
          outputFolderPath,
          ffmpegSettings,
        });
      } else {
        const players = await fetchMatchPlayersSlots(checksum);
        const cameras = await fetchCameras();
        await createCs2VideoJsonFile({
          type: 'record',
          recordingSystem,
          recordingOutput,
          encoderSoftware,
          framerate: captureFramerate,
          demoPath,
          sequences,
          closeGameAfterRecording,
          tickrate,
          outputFolderPath,
          players,
          cameras,
          trueView,
          ffmpegSettings,
        });
      }

      await watchDemoWithHlae({
        demoPath,
        game,
        width,
        height,
        displayMode: DisplayMode.Windowed,
        uninstallPluginOnExit: false,
        onGameStart: parameters.onGameStart,
      });

      onMoveFilesStart();
      if (isHlaeVideoOutput) {
        await moveHlaeVideoFilesToOutputFolder({
          outputFolderPath,
          sequences,
        });
      } else {
        await moveHlaeRawFilesToOutputFolder({
          outputFolderPath,
          sequences,
        });
      }

      await buildVideos(parameters);
    } catch (error) {
      if (isVideoGenerationAborted()) {
        throw abortError;
      }
      throw error;
    } finally {
      await deleteRawFiles();
      await deleteJsonActionsFile();
      if (isWindows) {
        await killCounterStrikeProcesses();
        await killHlaeProcess();
      }
      await uninstallCounterStrikeServerPlugin(game);
    }
  }
}

async function assertHlaeSupportsVideoOutput() {
  // checked in HLAE
}

async function moveHlaeVideoFilesToOutputFolder({
  outputFolderPath,
  sequences,
}: {
  outputFolderPath: string;
  sequences: Sequence[];
}) {
  // handled in HLAE
}
