import type { SequencePlayerOptions } from 'csdm/common/types/sequence-player-options';
import type { Sequence } from 'csdm/common/types/sequence';
import type { Match } from 'csdm/common/types/match';
import type { MatchPlayer } from 'csdm/common/types/match-player';
import { WeaponType, type WeaponName } from 'csdm/common/types/counter-strike';
import { Perspective } from 'csdm/common/types/perspective';
import type { VideoSettings } from 'csdm/node/settings/settings';
import type { Kill } from 'csdm/common/types/kill';
import { lastArrayItem } from 'csdm/common/array/last-array-item';

export type HighlightLifeMode = 'same_body' | 'human_only' | 'bot_only' | 'whole_round';

export type HudOverlayPosition = 'top-left' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-right' | 'none';

export type MatchHighlightSpecialFilters = {
  onlyHeadshot: boolean;
  onlyNoScope: boolean;
  onlyThroughSmoke: boolean;
  onlyWallbang: boolean;
  onlyAirborne: boolean;
  onlyBlind: boolean;
  onlyEntryKill: boolean;
  onlyUtilityOrKnife: boolean;
  onlyTradeKill: boolean;
  onlyBombAction: boolean;
  mode: 'restrict' | 'bonus';
};

export type BuildMatchHighlightsOptions = {
  match: Match;
  steamIds: string[];
  rounds: number[];
  weapons: WeaponName[];
  perspective: Perspective;
  minKillsInRound: number;
  lifeMode: HighlightLifeMode;
  includeClutches: boolean;
  minClutchOpponents: number;
  guaranteeAllPlayers: boolean;
  minSequencesPerPlayer: number;
  adaptiveThresholdForLowFraggers: boolean;
  specialFilters: MatchHighlightSpecialFilters;
  startSecondsBeforeEvent: number;
  endSecondsAfterEvent: number;
  maxSecondsBetweenEvents: number;
  settings: Pick<
    VideoSettings,
    'showOnlyDeathNotices' | 'deathNoticesDuration' | 'showXRay' | 'showAssists' | 'recordAudio' | 'playerVoicesEnabled'
  >;
  firstSequenceNumber: number;
  rapidKillsEnabled?: boolean;
  rapidMinKills?: number;
  rapidWindowSeconds?: number;
};

function buildPlayersOptions(players: MatchPlayer[], highlightedSteamIds: string[]) {
  const options: SequencePlayerOptions[] = players.map((player) => {
    return {
      highlightKill: highlightedSteamIds.includes(player.steamId),
      playerName: player.name,
      showKill: true,
      steamId: player.steamId,
      isVoiceEnabled: true,
    };
  });

  return options;
}

function getSteamIdToFocus(kill: Kill, perspective: Perspective) {
  if (perspective === Perspective.Enemy && kill.victimSteamId) {
    return kill.victimSteamId;
  }

  return kill.killerSteamId;
}

function isUtilityOrKnifeKill(kill: Kill) {
  return (
    kill.weaponType === WeaponType.Knife ||
    kill.weaponType === WeaponType.Grenade ||
    kill.weaponType === WeaponType.Equipment
  );
}

export function buildMatchHighlightsSequences({
  match,
  steamIds,
  rounds,
  weapons,
  perspective,
  minKillsInRound,
  lifeMode,
  includeClutches,
  minClutchOpponents,
  guaranteeAllPlayers,
  minSequencesPerPlayer,
  adaptiveThresholdForLowFraggers,
  specialFilters,
  startSecondsBeforeEvent,
  endSecondsAfterEvent,
  maxSecondsBetweenEvents,
  settings,
  firstSequenceNumber,
  rapidKillsEnabled = false,
  rapidMinKills = 3,
  rapidWindowSeconds = 5,
}: BuildMatchHighlightsOptions): Sequence[] {
  if (steamIds.length === 0 || match.kills.length === 0) {
    return [];
  }

  // 1. Identify entry kills per round and bomb planters/defusers per round
  const firstKillIdPerRound = new Map<number, number>();
  const bombActionPlayersPerRound = new Set<string>();

  if (Array.isArray(match.bombsPlanted)) {
    for (const plant of match.bombsPlanted) {
      bombActionPlayersPerRound.add(`${plant.roundNumber}:${plant.planterSteamId}`);
    }
  }
  if (Array.isArray(match.bombsDefused)) {
    for (const defuse of match.bombsDefused) {
      bombActionPlayersPerRound.add(`${defuse.roundNumber}:${defuse.defuserSteamId}`);
    }
  }

  // 2. Segment kills by "boneco / vida" in each round
  // Whenever a player dies (victimSteamId === player) OR switches between human body and controlling a bot
  // (isKillerControllingBot changes), a new life segment starts for that player in that round.
  const currentSegmentIndex = new Map<string, number>();
  const lastBotControlState = new Map<string, boolean>();
  const killSegmentKeyById = new Map<number, string>();
  const killsPerSegment = new Map<string, Kill[]>();
  const totalMatchKillsPerPlayer = new Map<string, number>();

  for (const kill of match.kills) {
    if (!firstKillIdPerRound.has(kill.roundNumber)) {
      firstKillIdPerRound.set(kill.roundNumber, kill.id);
    }

    // If a player died on this kill, advance their life segment counter for this round
    if (kill.victimSteamId) {
      const victimRoundKey = `${kill.roundNumber}:${kill.victimSteamId}`;
      const prevSeg = currentSegmentIndex.get(victimRoundKey) ?? 0;
      currentSegmentIndex.set(victimRoundKey, prevSeg + 1);
      lastBotControlState.delete(victimRoundKey);
    }

    if (!kill.killerSteamId || kill.killerSteamId === kill.victimSteamId) {
      continue;
    }

    // Filter by lifeMode if restricting to human-only or bot-only kills
    if (lifeMode === 'human_only' && kill.isKillerControllingBot) {
      continue;
    }
    if (lifeMode === 'bot_only' && !kill.isKillerControllingBot) {
      continue;
    }

    totalMatchKillsPerPlayer.set(kill.killerSteamId, (totalMatchKillsPerPlayer.get(kill.killerSteamId) ?? 0) + 1);

    const killerRoundKey = `${kill.roundNumber}:${kill.killerSteamId}`;
    let segIdx = currentSegmentIndex.get(killerRoundKey) ?? 0;

    if (lifeMode !== 'whole_round') {
      const prevBotState = lastBotControlState.get(killerRoundKey);
      if (prevBotState !== undefined && prevBotState !== kill.isKillerControllingBot) {
        segIdx += 1;
        currentSegmentIndex.set(killerRoundKey, segIdx);
      }
      lastBotControlState.set(killerRoundKey, kill.isKillerControllingBot);
    }

    const segmentKey = lifeMode === 'whole_round' ? killerRoundKey : `${killerRoundKey}:seg${segIdx}`;
    killSegmentKeyById.set(kill.id, segmentKey);

    const list = killsPerSegment.get(segmentKey);
    if (list) {
      list.push(kill);
    } else {
      killsPerSegment.set(segmentKey, [kill]);
    }
  }

  // Compute median kills across selected players for adaptive threshold
  const selectedPlayersKillCounts = steamIds
    .map((id) => totalMatchKillsPerPlayer.get(id) ?? 0)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  const medianKillCount =
    selectedPlayersKillCounts.length > 0
      ? selectedPlayersKillCounts[Math.floor(selectedPlayersKillCounts.length / 2)]
      : 0;

  // 2b. Identify rapid kills in sequence within the same life segment (e.g. 3 kills in <= 5s even if minKillsInRound is 5+)
  const rapidKillIds = new Set<number>();
  if (rapidKillsEnabled && rapidMinKills >= 2) {
    const windowTicks = Math.round(Math.max(1, match.tickrate || 64) * rapidWindowSeconds);
    for (const segList of killsPerSegment.values()) {
      const ks = [...segList].sort((a, b) => a.tick - b.tick);
      let j = 0;
      for (let i = 0; i < ks.length; i++) {
        if (j < i) j = i;
        while (j + 1 < ks.length && ks[j + 1].tick - ks[i].tick <= windowTicks) {
          j++;
        }
        if (j - i + 1 >= rapidMinKills) {
          for (let x = i; x <= j; x++) {
            rapidKillIds.add(ks[x].id);
          }
        }
      }
    }
  }

  // 3. Index won clutches that meet minClutchOpponents
  const wonClutches = new Map<string, number>();
  if (includeClutches && Array.isArray(match.clutches)) {
    for (const clutch of match.clutches) {
      if (clutch.won && clutch.opponentCount >= minClutchOpponents) {
        const key = `${clutch.roundNumber}:${clutch.clutcherSteamId}`;
        wonClutches.set(key, clutch.tick);
      }
    }
  }

  const {
    onlyHeadshot,
    onlyNoScope,
    onlyThroughSmoke,
    onlyWallbang,
    onlyAirborne,
    onlyBlind,
    onlyEntryKill,
    onlyUtilityOrKnife,
    onlyTradeKill,
    onlyBombAction,
    mode: specialMode,
  } = specialFilters;

  const hasAnySpecialFilter =
    onlyHeadshot ||
    onlyNoScope ||
    onlyThroughSmoke ||
    onlyWallbang ||
    onlyAirborne ||
    onlyBlind ||
    onlyEntryKill ||
    onlyUtilityOrKnife ||
    onlyTradeKill ||
    onlyBombAction;

  const matchesSpecialRestrict = (kill: Kill) => {
    if (onlyHeadshot && !kill.isHeadshot) return false;
    if (onlyNoScope && !kill.isNoScope) return false;
    if (onlyThroughSmoke && !kill.isThroughSmoke) return false;
    if (onlyWallbang && !(kill.penetratedObjects > 0)) return false;
    if (onlyAirborne && !kill.isKillerAirborne) return false;
    if (onlyBlind && !kill.isKillerBlinded) return false;
    if (onlyEntryKill && firstKillIdPerRound.get(kill.roundNumber) !== kill.id) return false;
    if (onlyUtilityOrKnife && !isUtilityOrKnifeKill(kill)) return false;
    if (onlyTradeKill && !kill.isTradeKill) return false;
    if (onlyBombAction && !bombActionPlayersPerRound.has(`${kill.roundNumber}:${kill.killerSteamId}`)) return false;
    return true;
  };

  const matchesSpecialBonus = (kill: Kill) => {
    if (onlyHeadshot && kill.isHeadshot) return true;
    if (onlyNoScope && kill.isNoScope) return true;
    if (onlyThroughSmoke && kill.isThroughSmoke) return true;
    if (onlyWallbang && kill.penetratedObjects > 0) return true;
    if (onlyAirborne && kill.isKillerAirborne) return true;
    if (onlyBlind && kill.isKillerBlinded) return true;
    if (onlyEntryKill && firstKillIdPerRound.get(kill.roundNumber) === kill.id) return true;
    if (onlyUtilityOrKnife && isUtilityOrKnifeKill(kill)) return true;
    if (onlyTradeKill && kill.isTradeKill) return true;
    if (onlyBombAction && bombActionPlayersPerRound.has(`${kill.roundNumber}:${kill.killerSteamId}`)) return true;
    return false;
  };

  const isKillEligibleByBaseFilters = (kill: Kill) => {
    if (!kill.killerSteamId || kill.killerSteamId === kill.victimSteamId) {
      return false;
    }
    if (!steamIds.includes(kill.killerSteamId)) {
      return false;
    }
    if (rounds.length > 0 && !rounds.includes(kill.roundNumber)) {
      return false;
    }
    if (weapons.length > 0 && !weapons.includes(kill.weaponName)) {
      return false;
    }
    if (lifeMode === 'human_only' && kill.isKillerControllingBot) {
      return false;
    }
    if (lifeMode === 'bot_only' && !kill.isKillerControllingBot) {
      return false;
    }
    return true;
  };

  const qualifyingKillIds = new Set<number>();
  const qualifyingSegmentsPerPlayer = new Map<string, Set<string>>();

  for (const kill of match.kills) {
    if (!isKillEligibleByBaseFilters(kill)) {
      continue;
    }

    const segmentKey = killSegmentKeyById.get(kill.id);
    if (!segmentKey) {
      continue;
    }

    const segmentKillsCount = killsPerSegment.get(segmentKey)?.length ?? 0;
    const playerTotalKills = totalMatchKillsPerPlayer.get(kill.killerSteamId) ?? 0;

    // If adaptiveThresholdForLowFraggers is active and player has <= median kills, lower their required kills (min 2)
    let effectiveMinKills = minKillsInRound;
    if (adaptiveThresholdForLowFraggers && minKillsInRound > 2 && playerTotalKills <= medianKillCount) {
      effectiveMinKills = Math.max(2, Math.ceil(minKillsInRound / 2));
    }

    const roundPlayerKey = `${kill.roundNumber}:${kill.killerSteamId}`;
    const clutchStartTick = wonClutches.get(roundPlayerKey);
    const isClutchKill = clutchStartTick !== undefined && kill.tick >= clutchStartTick;
    const isRapidStreakKill = rapidKillIds.has(kill.id);
    const meetsMultiKillOrClutch = segmentKillsCount >= effectiveMinKills || isClutchKill || isRapidStreakKill;

    let qualifies = false;
    if (!hasAnySpecialFilter) {
      qualifies = meetsMultiKillOrClutch;
    } else if (specialMode === 'bonus') {
      qualifies = meetsMultiKillOrClutch || matchesSpecialBonus(kill);
    } else {
      qualifies = meetsMultiKillOrClutch && matchesSpecialRestrict(kill);
    }

    if (qualifies) {
      qualifyingKillIds.add(kill.id);
      let playerSegs = qualifyingSegmentsPerPlayer.get(kill.killerSteamId);
      if (!playerSegs) {
        playerSegs = new Set<string>();
        qualifyingSegmentsPerPlayer.set(kill.killerSteamId, playerSegs);
      }
      playerSegs.add(segmentKey);
    }
  }

  // 4. Guarantee appearance for low-kill players if guaranteeAllPlayers is enabled
  if (guaranteeAllPlayers && minSequencesPerPlayer > 0) {
    for (const steamId of steamIds) {
      // Ignore pure bot placeholder steamId '0' if present
      if (steamId === '0') {
        continue;
      }

      const existingSegs = qualifyingSegmentsPerPlayer.get(steamId) ?? new Set<string>();
      const neededCount = minSequencesPerPlayer - existingSegs.size;
      if (neededCount <= 0) {
        continue;
      }

      // Collect candidate segments for this player that respect round/weapon filters
      const candidateSegments: { segmentKey: string; kills: Kill[]; score: number }[] = [];
      for (const [segmentKey, segKills] of killsPerSegment.entries()) {
        if (existingSegs.has(segmentKey)) {
          continue;
        }
        if (segKills.length === 0 || segKills[0].killerSteamId !== steamId) {
          continue;
        }
        const filteredSegKills = segKills.filter(isKillEligibleByBaseFilters);
        if (filteredSegKills.length === 0) {
          continue;
        }

        // Score segment by: kill count (x100), special attributes (x15), headshots (x5), human body bonus (+10)
        let score = filteredSegKills.length * 100;
        for (const k of filteredSegKills) {
          if (!k.isKillerControllingBot) score += 10;
          if (k.isHeadshot) score += 8;
          if (k.isNoScope || k.isThroughSmoke || k.penetratedObjects > 0 || isUtilityOrKnifeKill(k)) score += 20;
          if (k.isTradeKill) score += 5;
          if (bombActionPlayersPerRound.has(`${k.roundNumber}:${k.killerSteamId}`)) score += 12;
        }
        candidateSegments.push({ segmentKey, kills: filteredSegKills, score });
      }

      candidateSegments.sort((a, b) => b.score - a.score);

      for (let i = 0; i < Math.min(neededCount, candidateSegments.length); i++) {
        const chosen = candidateSegments[i];
        for (const k of chosen.kills) {
          qualifyingKillIds.add(k.id);
        }
      }
    }
  }

  const qualifyingKills = match.kills.filter((kill) => qualifyingKillIds.has(kill.id));
  if (qualifyingKills.length === 0) {
    return [];
  }

  // 5. Group kills into sequences ordered chronologically, never merging across different life segments of the same player
  const minimumSecondsBetweenTwoEvents = 2;
  const ticksRequiredBetweenTwoSequences = Math.round(match.tickrate * minimumSecondsBetweenTwoEvents);
  const additionalTicksBeforeEvent = Math.round(match.tickrate * startSecondsBeforeEvent);
  const additionalTicksAfterEvent = Math.round(match.tickrate * endSecondsAfterEvent);
  const maxTicksBetweenEvents = Math.round(match.tickrate * maxSecondsBetweenEvents);

  const sequences: Sequence[] = [];

  for (const [index, kill] of qualifyingKills.entries()) {
    const steamIdToFocus = getSteamIdToFocus(kill, perspective);
    const sequenceStartTick = Math.max(1, kill.tick - additionalTicksBeforeEvent);
    let sequenceEndTick = Math.min(match.tickCount, kill.tick + additionalTicksAfterEvent);
    const currentSegKey = killSegmentKeyById.get(kill.id);

    const nextKill = index < qualifyingKills.length - 1 ? qualifyingKills[index + 1] : undefined;
    if (nextKill !== undefined && nextKill.roundNumber === kill.roundNumber) {
      const nextSegKey = killSegmentKeyById.get(nextKill.id);
      const isDifferentBodyOfSamePlayer =
        nextKill.killerSteamId === kill.killerSteamId && currentSegKey !== nextSegKey;
      const isNextKillTooClose = kill.tick + maxTicksBetweenEvents >= nextKill.tick;
      if (!isDifferentBodyOfSamePlayer && isNextKillTooClose) {
        sequenceEndTick = Math.min(match.tickCount, nextKill.tick + additionalTicksAfterEvent);
      }
    }

    const previousSequence = sequences.length > 0 ? lastArrayItem(sequences) : undefined;
    const previousKill = index > 0 ? qualifyingKills[index - 1] : undefined;

    if (previousSequence !== undefined && previousKill !== undefined) {
      const prevSegKey = killSegmentKeyById.get(previousKill.id);
      const isSameRound = previousKill.roundNumber === kill.roundNumber;
      const isDifferentBodyOfSamePlayer =
        previousKill.killerSteamId === kill.killerSteamId && prevSegKey !== currentSegKey;
      const areSequencesOverlapping =
        isSameRound &&
        !isDifferentBodyOfSamePlayer &&
        (previousSequence.endTick + ticksRequiredBetweenTwoSequences >= sequenceStartTick ||
          (previousKill.killerSteamId === kill.killerSteamId &&
            previousKill.tick + maxTicksBetweenEvents >= kill.tick));

      if (areSequencesOverlapping) {
        previousSequence.endTick = Math.max(previousSequence.endTick, sequenceEndTick);
        const lastCamera = lastArrayItem(previousSequence.playerCameras);
        if (!lastCamera || lastCamera.playerSteamId !== steamIdToFocus) {
          const midpointTick = Math.max(
            previousSequence.startTick,
            Math.round((previousKill.tick + kill.tick) / 2),
          );
          previousSequence.playerCameras.push({
            tick: midpointTick,
            playerSteamId: steamIdToFocus,
            playerName:
              match.players.find((player) => player.steamId === steamIdToFocus)?.name ?? kill.killerName ?? '',
            roundNumber: kill.roundNumber,
          } as Sequence['playerCameras'][number]);
        }
        for (const option of previousSequence.playersOptions) {
          if (option.steamId === kill.killerSteamId) {
            option.highlightKill = true;
          }
        }
        continue;
      }
    }

    sequences.push({
      number: firstSequenceNumber + sequences.length,
      startTick: sequenceStartTick,
      endTick: sequenceEndTick,
      roundNumber: kill.roundNumber,
      showOnlyDeathNotices: settings.showOnlyDeathNotices,
      deathNoticesDuration: settings.deathNoticesDuration,
      showXRay: settings.showXRay,
      showAssists: settings.showAssists,
      recordAudio: settings.recordAudio,
      playerVoicesEnabled: settings.playerVoicesEnabled,
      playersOptions: buildPlayersOptions(match.players, [kill.killerSteamId]),
      playerCameras: [
        {
          tick: sequenceStartTick,
          playerSteamId: steamIdToFocus,
          playerName:
            match.players.find((player) => player.steamId === steamIdToFocus)?.name ?? kill.killerName ?? '',
          roundNumber: kill.roundNumber,
        } as Sequence['playerCameras'][number],
      ],
      cameras: [],
    } as Sequence);
  }

  return sequences;
}
