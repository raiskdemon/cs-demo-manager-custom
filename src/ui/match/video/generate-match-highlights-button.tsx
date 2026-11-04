import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonVariant } from 'csdm/ui/components/buttons/button';
import type { SelectOption } from 'csdm/ui/components/inputs/select';
import { Select } from 'csdm/ui/components/inputs/select';
import { useCurrentMatch } from '../use-current-match';
import { useCurrentMatchSequences } from './sequences/use-current-match-sequences';
import { replaceSequences } from './sequences/sequences-actions';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from 'csdm/ui/dialogs/dialog';
import { CancelButton } from 'csdm/ui/components/buttons/cancel-button';
import { useDialog } from 'csdm/ui/components/dialogs/use-dialog';
import { useDispatch } from 'csdm/ui/store/use-dispatch';
import { WeaponsFilter } from 'csdm/ui/components/dropdown-filter/weapons-filter';
import { uniqueArray } from 'csdm/common/array/unique-array';
import type { Match } from 'csdm/common/types/match';
import type { WeaponName } from 'csdm/common/types/counter-strike';
import { Perspective } from 'csdm/common/types/perspective';
import { useVideoSettings } from 'csdm/ui/settings/video/use-video-settings';
import { SecondsInput } from 'csdm/ui/components/inputs/seconds-input';
import { PlayersSelect } from 'csdm/ui/components/inputs/select/players-select';
import { RoundsSelect } from 'csdm/ui/components/inputs/select/rounds-select';
import { Checkbox } from 'csdm/ui/components/inputs/checkbox';
import {
  buildMatchHighlightsSequences,
  type HighlightLifeMode,
  type HudOverlayPosition,
  type MatchHighlightSpecialFilters,
} from 'csdm/common/video/sequences/build-match-highlights-sequences';
import { getNextSequenceNumber } from 'csdm/common/video/sequences/get-next-sequence-number';
import { sortSequencesByNumber } from 'csdm/common/video/sequences/sort-sequences-by-number';
import { useWebSocketClient } from 'csdm/ui/hooks/use-web-socket-client';
import { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';
import type { AddVideoPayload } from 'csdm/common/types/video';
import { RoutePath } from 'csdm/ui/routes-paths';
import { isErrorCode } from 'csdm/common/is-error-code';
import { ErrorCode } from 'csdm/common/error-code';
import { getPlaybackErrorMessageFromErrorCode } from '../../shared/get-playback-error-from-error-code';
import { AddVideoToQueueErrorDialog } from './add-video-to-queue-error-dialog';

function getVisibleWeaponsForKillers(steamIds: string[], match: Match): WeaponName[] {
  if (steamIds.length === 0) {
    return [];
  }

  return uniqueArray(
    match.kills
      .filter((kill) => steamIds.includes(kill.killerSteamId))
      .map((kill) => kill.weaponName),
  );
}

function formatDuration(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function GenerateMatchHighlightsDialog() {
  const dispatch = useDispatch();
  const match = useCurrentMatch();
  const existingSequences = useCurrentMatchSequences();
  const { settings, updateSettings } = useVideoSettings();
  const { hideDialog, showDialog } = useDialog();
  const client = useWebSocketClient();
  const navigate = useNavigate();

  const allSteamIds = useMemo(() => match.players.map((p) => p.steamId), [match.players]);
  const teamASteamIds = useMemo(
    () => match.players.filter((p) => p.teamName === match.teamA.name).map((p) => p.steamId),
    [match.players, match.teamA.name],
  );
  const teamBSteamIds = useMemo(
    () => match.players.filter((p) => p.teamName === match.teamB.name).map((p) => p.steamId),
    [match.players, match.teamB.name],
  );

  const [selectedSteamIds, setSelectedSteamIds] = useState<string[]>(allSteamIds);
  const [selectedRounds, setSelectedRounds] = useState<number[]>([]);
  const visibleWeapons = useMemo(
    () => getVisibleWeaponsForKillers(selectedSteamIds, match),
    [selectedSteamIds, match],
  );
  const [selectedWeapons, setSelectedWeapons] = useState<WeaponName[]>(visibleWeapons);
  const [perspective, setPerspective] = useState<Perspective>(Perspective.Player);

  // Highlight criteria state (supports 10x10 matches up to 10K & single body/life mode)
  const [minKillsInRound, setMinKillsInRound] = useState<number>(3);
  const [lifeMode, setLifeMode] = useState<HighlightLifeMode>('same_body');
  const [includeClutches, setIncludeClutches] = useState<boolean>(true);
  const [minClutchOpponents, setMinClutchOpponents] = useState<number>(2);
  const [rapidKillsEnabled, setRapidKillsEnabled] = useState<boolean>(true);
  const [rapidMinKills, setRapidMinKills] = useState<number>(3);
  const [rapidWindowSeconds, setRapidWindowSeconds] = useState<number>(5);

  // Inclusion of players who kill less
  const [guaranteeAllPlayers, setGuaranteeAllPlayers] = useState<boolean>(false);
  const [minSequencesPerPlayer, setMinSequencesPerPlayer] = useState<number>(1);
  const [adaptiveThresholdForLowFraggers, setAdaptiveThresholdForLowFraggers] = useState<boolean>(false);

  // Background hidden window & Video Overlays / Intro / Transitions options
  const [hideGameWindow, setHideGameWindow] = useState<boolean>(
    (settings as unknown as { hideGameWindow?: boolean }).hideGameWindow ?? true,
  );
  const [hudPosition, setHudPosition] = useState<HudOverlayPosition>(
    (settings as unknown as { hudPosition?: HudOverlayPosition }).hudPosition ?? 'top-left',
  );
  const [showIntroScreen, setShowIntroScreen] = useState<boolean>(
    (settings as unknown as { showIntroScreen?: boolean }).showIntroScreen ?? true,
  );
  const [showOutroScreen, setShowOutroScreen] = useState<boolean>(
    (settings as unknown as { showOutroScreen?: boolean }).showOutroScreen ?? true,
  );
  const [enableKillCounter, setEnableKillCounter] = useState<boolean>(
    (settings as unknown as { enableKillCounter?: boolean }).enableKillCounter ?? true,
  );
  const [enableSlowMotion, setEnableSlowMotion] = useState<boolean>(
    (settings as unknown as { enableSlowMotion?: boolean }).enableSlowMotion ?? true,
  );
  const [enableSequenceTransitions, setEnableSequenceTransitions] = useState<boolean>(
    (settings as unknown as { enableSequenceTransitions?: boolean }).enableSequenceTransitions ?? true,
  );

  const [specialFilters, setSpecialFilters] = useState<MatchHighlightSpecialFilters>({
    onlyHeadshot: false,
    onlyNoScope: false,
    onlyThroughSmoke: false,
    onlyWallbang: false,
    onlyAirborne: false,
    onlyBlind: false,
    onlyEntryKill: false,
    onlyUtilityOrKnife: false,
    onlyTradeKill: false,
    onlyBombAction: false,
    mode: 'bonus',
  });

  // Timeline timing state
  const [startSecondsBeforeEvent, setStartSecondsBeforeEvent] = useState<number>(3);
  const [endSecondsAfterEvent, setEndSecondsAfterEvent] = useState<number>(2);
  const [maxSecondsBetweenEvents, setMaxSecondsBetweenEvents] = useState<number>(10);
  const [preserveExistingSequences, setPreserveExistingSequences] = useState<boolean>(false);
  const [isStartingRecording, setIsStartingRecording] = useState<boolean>(false);

  const minKillsOptions: SelectOption<number>[] = [
    { value: 1, label: '1K+ (Todos os abates selecionados)' },
    { value: 2, label: '2K+ (Double Kill ou mais)' },
    { value: 3, label: '3K+ (Triple Kill ou mais - Recomendado)' },
    { value: 4, label: '4K+ (Quadra Kill ou mais)' },
    { value: 5, label: '5K+ (5 abates ou mais)' },
    { value: 6, label: '6K+ (6 abates ou mais - 10x10)' },
    { value: 7, label: '7K+ (7 abates ou mais - 10x10)' },
    { value: 8, label: '8K+ (8 abates ou mais - 10x10)' },
    { value: 9, label: '9K+ (9 abates ou mais - 10x10)' },
    { value: 10, label: '10K (10 abates no round - 10x10)' },
  ];

  const lifeModeOptions: SelectOption<HighlightLifeMode>[] = [
    {
      value: 'same_body',
      label: 'No mesmo boneco (Próprio OU Bot assumido, sem morrer no meio) [Recomendado]',
    },
    {
      value: 'human_only',
      label: 'Apenas no próprio boneco (Ignorar kills controlando Bot)',
    },
    {
      value: 'bot_only',
      label: 'Apenas controlando Bot (Somente lances jogando no Bot)',
    },
    {
      value: 'whole_round',
      label: 'Somar round inteiro (Permitir morrer e continuar matando no Bot)',
    },
  ];

  const minClutchOptions: SelectOption<number>[] = [
    { value: 1, label: '1v1 ou maior' },
    { value: 2, label: '1v2 ou maior (Recomendado)' },
    { value: 3, label: '1v3 ou maior' },
    { value: 4, label: '1v4 ou maior' },
    { value: 5, label: '1v5 ou maior' },
    { value: 6, label: '1v6 ou maior (10x10)' },
    { value: 7, label: '1v7 ou maior (10x10)' },
    { value: 8, label: '1v8 ou maior (10x10)' },
  ];

  const minSequencesPerPlayerOptions: SelectOption<number>[] = [
    { value: 1, label: 'Pelo menos 1 melhor lance de cada jogador' },
    { value: 2, label: 'Pelo menos 2 melhores lances de cada jogador' },
    { value: 3, label: 'Pelo menos 3 melhores lances de cada jogador' },
  ];

  const specialModeOptions: SelectOption<'bonus' | 'restrict'>[] = [
    { value: 'bonus', label: 'Incluir também abates com estes atributos (Bônus)' },
    { value: 'restrict', label: 'Exigir obrigatoriamente os atributos marcados (Restrito)' },
  ];

  const hudPositionOptions: SelectOption<HudOverlayPosition>[] = [
    { value: 'top-left', label: 'Canto Superior Esquerdo (Recomendado - livre do Killfeed)' },
    { value: 'bottom-left', label: 'Canto Inferior Esquerdo' },
    { value: 'bottom-right', label: 'Canto Inferior Direito' },
    { value: 'top-center', label: 'Topo Centralizado' },
    { value: 'top-right', label: 'Canto Superior Direito' },
    { value: 'none', label: 'Desativado (Sem nome na tela)' },
  ];

  const rapidMinKillsOptions: SelectOption<number>[] = [
    { value: 2, label: '2 abates rápidos' },
    { value: 3, label: '3 abates rápidos (Recomendado)' },
    { value: 4, label: '4 abates rápidos' },
    { value: 5, label: '5 abates rápidos' },
  ];

  const rapidWindowOptions: SelectOption<number>[] = [
    { value: 3, label: 'em até 3 segundos (muito rápido)' },
    { value: 5, label: 'em até 5 segundos (Recomendado)' },
    { value: 8, label: 'em até 8 segundos' },
    { value: 10, label: 'em até 10 segundos' },
  ];

  const generatedSequences = useMemo(() => {
    const firstSequenceNumber = preserveExistingSequences ? getNextSequenceNumber(existingSequences) : 1;
    return buildMatchHighlightsSequences({
      match,
      steamIds: selectedSteamIds,
      rounds: selectedRounds,
      weapons: selectedWeapons,
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
      rapidKillsEnabled,
      rapidMinKills,
      rapidWindowSeconds,
    });
  }, [
    match,
    selectedSteamIds,
    selectedRounds,
    selectedWeapons,
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
    preserveExistingSequences,
    existingSequences,
    rapidKillsEnabled,
    rapidMinKills,
    rapidWindowSeconds,
  ]);

  const finalSequences = useMemo(() => {
    if (preserveExistingSequences) {
      return sortSequencesByNumber([...existingSequences, ...generatedSequences]);
    }
    return generatedSequences;
  }, [preserveExistingSequences, existingSequences, generatedSequences]);

  const totalDurationSeconds = useMemo(() => {
    if (match.tickrate <= 0) return 0;
    const totalTicks = finalSequences.reduce((acc, seq) => acc + Math.max(0, seq.endTick - seq.startTick), 0);
    const introExtra = showIntroScreen && finalSequences.length > 0 ? 8 : 0;
    const outroExtra = showOutroScreen && finalSequences.length > 0 ? 5 : 0;
    return totalTicks / match.tickrate + introExtra + outroExtra;
  }, [finalSequences, match.tickrate, showIntroScreen, showOutroScreen]);

  const includedPlayersCount = useMemo(() => {
    const set = new Set<string>();
    for (const seq of finalSequences) {
      for (const cam of seq.playerCameras) {
        if (cam.playerSteamId) {
          set.add(cam.playerSteamId);
        }
      }
    }
    return set.size;
  }, [finalSequences]);

  const applyPlayersSelection = (steamIds: string[]) => {
    setSelectedSteamIds(steamIds);
    setSelectedWeapons(getVisibleWeaponsForKillers(steamIds, match));
  };

  const applyTimelineOnly = () => {
    if (finalSequences.length === 0) {
      return;
    }
    dispatch(
      replaceSequences({
        demoFilePath: match.demoFilePath,
        sequences: finalSequences,
      }),
    );
    hideDialog();
  };

  const applyTimelineAndRecordNow = async () => {
    if (finalSequences.length === 0 || isStartingRecording) {
      return;
    }

    setIsStartingRecording(true);
    await updateSettings({
      ...({
        hideGameWindow,
        hudPosition,
        showIntroScreen,
        showOutroScreen,
        enableKillCounter,
        enableSlowMotion,
        enableSequenceTransitions,
      } as unknown as Partial<typeof settings>),
    });
    dispatch(
      replaceSequences({
        demoFilePath: match.demoFilePath,
        sequences: finalSequences,
      }),
    );

    try {
      const payload: AddVideoPayload = {
        ...settings,
        ...({
          hideGameWindow,
          hudPosition,
          showIntroScreen,
          showOutroScreen,
          enableKillCounter,
          enableSlowMotion,
          enableSequenceTransitions,
        } as unknown as object),
        checksum: match.checksum,
        game: match.game,
        tickrate: match.tickrate,
        demoPath: match.demoFilePath,
        mapName: match.mapName,
        sequences: finalSequences,
      };
      await client.send({
        name: RendererClientMessageName.AddVideoToQueue,
        payload,
      });
      await client.send({
        name: RendererClientMessageName.ResumeVideoQueue,
      });
      hideDialog();
      await navigate(RoutePath.Videos);
    } catch (error) {
      setIsStartingRecording(false);
      const errorCode = isErrorCode(error) ? error : ErrorCode.UnknownError;
      const message = getPlaybackErrorMessageFromErrorCode(errorCode, match.game);
      showDialog(<AddVideoToQueueErrorDialog>{message}</AddVideoToQueueErrorDialog>);
    }
  };

  return (
    <Dialog onEnterPressed={applyTimelineOnly}>
      <DialogHeader>
        <DialogTitle>Gerar Highlights da Partida (Timeline & Gravação Automática)</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex w-[680px] max-h-[78vh] overflow-y-auto flex-col gap-y-12 pr-4">
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-8 rounded-4 border border-gray-400 p-8">
            <span className="text-body-strong mr-4">Presets Rápidos:</span>
            <Button
              onClick={() => {
                setMinKillsInRound(4);
                setLifeMode('same_body');
                setIncludeClutches(true);
                setMinClutchOpponents(2);
                setGuaranteeAllPlayers(true);
                setMinSequencesPerPlayer(1);
                setAdaptiveThresholdForLowFraggers(true);
                setSpecialFilters({
                  onlyHeadshot: false,
                  onlyNoScope: true,
                  onlyThroughSmoke: true,
                  onlyWallbang: true,
                  onlyAirborne: false,
                  onlyBlind: false,
                  onlyEntryKill: false,
                  onlyUtilityOrKnife: true,
                  onlyTradeKill: false,
                  onlyBombAction: false,
                  mode: 'bonus',
                });
              }}
            >
              10x10 Amigos (4K+ Mesmo Boneco + Todos Aparecem)
            </Button>
            <Button
              onClick={() => {
                setMinKillsInRound(5);
                setLifeMode('same_body');
                setIncludeClutches(true);
                setMinClutchOpponents(3);
                setGuaranteeAllPlayers(false);
                setAdaptiveThresholdForLowFraggers(false);
                setSpecialFilters({
                  onlyHeadshot: false,
                  onlyNoScope: true,
                  onlyThroughSmoke: true,
                  onlyWallbang: true,
                  onlyAirborne: false,
                  onlyBlind: false,
                  onlyEntryKill: false,
                  onlyUtilityOrKnife: false,
                  onlyTradeKill: false,
                  onlyBombAction: false,
                  mode: 'bonus',
                });
              }}
            >
              10x10 Insano (5K+ Mesmo Boneco / Clutches 1v3+)
            </Button>
            <Button
              onClick={() => {
                setMinKillsInRound(3);
                setLifeMode('same_body');
                setIncludeClutches(true);
                setMinClutchOpponents(2);
                setGuaranteeAllPlayers(false);
                setAdaptiveThresholdForLowFraggers(false);
                setSpecialFilters({
                  onlyHeadshot: false,
                  onlyNoScope: true,
                  onlyThroughSmoke: true,
                  onlyWallbang: true,
                  onlyAirborne: false,
                  onlyBlind: false,
                  onlyEntryKill: false,
                  onlyUtilityOrKnife: false,
                  onlyTradeKill: false,
                  onlyBombAction: false,
                  mode: 'bonus',
                });
              }}
            >
              Padrão (3K+ / Clutches / Bônus)
            </Button>
          </div>

          {/* Players & Team Filter */}
          <div className="flex flex-col gap-y-8">
            <div className="flex items-center gap-x-8">
              <span className="text-body-strong">Seleção Rápida de Jogadores:</span>
              <Button onClick={() => applyPlayersSelection(allSteamIds)}>Todos ({allSteamIds.length})</Button>
              <Button onClick={() => applyPlayersSelection(teamASteamIds)}>{match.teamA.name}</Button>
              <Button onClick={() => applyPlayersSelection(teamBSteamIds)}>{match.teamB.name}</Button>
            </div>
            <PlayersSelect
              players={match.players}
              selectedSteamIds={selectedSteamIds}
              onChange={applyPlayersSelection}
            />
          </div>

          {/* Multi-kill (up to 10K), Same Body/Bot Filter, and Clutch Filters */}
          <div className="flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8">
            <span className="text-body-strong">Critério de Abates no Round & Controle de Bot (10x10):</span>
            <Select
              label="Regra de Boneco / Vida no Round (Evitar somar kills após morrer e pegar Bot)"
              options={lifeModeOptions}
              value={lifeMode}
              onChange={setLifeMode}
            />
            <div className="grid grid-cols-2 gap-12">
              <div className="flex flex-col gap-y-8">
                <Select
                  label="Mínimo de abates no mesmo boneco/round (1K a 10K)"
                  options={minKillsOptions}
                  value={minKillsInRound}
                  onChange={setMinKillsInRound}
                />
                <Select
                  label="Perspectiva da Câmera (POV)"
                  options={[
                    { value: Perspective.Player, label: 'Jogador (Autor do Abate)' },
                    { value: Perspective.Enemy, label: 'Inimigo (Vítima)' },
                  ]}
                  value={perspective}
                  onChange={setPerspective}
                />
              </div>
              <div className="flex flex-col gap-y-8">
                <Checkbox
                  label="Incluir Clutches vencidos automaticamente"
                  isChecked={includeClutches}
                  onChange={(e) => setIncludeClutches(e.target.checked)}
                />
                {includeClutches && (
                  <Select
                    label="Mínimo de oponentes no Clutch"
                    options={minClutchOptions}
                    value={minClutchOpponents}
                    onChange={setMinClutchOpponents}
                  />
                )}
              </div>
            </div>
            <Checkbox
              label="Incluir abates rápidos em sequência (entra no vídeo mesmo sem atingir o mínimo de abates do round)"
              isChecked={rapidKillsEnabled}
              onChange={(e) => setRapidKillsEnabled(e.target.checked)}
            />
            {rapidKillsEnabled && (
              <div className="grid grid-cols-2 gap-12">
                <Select
                  label="Quantidade de abates rápidos (mesmo boneco)"
                  options={rapidMinKillsOptions}
                  value={rapidMinKills}
                  onChange={setRapidMinKills}
                />
                <Select
                  label="Janela de tempo entre o 1º e o último abate"
                  options={rapidWindowOptions}
                  value={rapidWindowSeconds}
                  onChange={setRapidWindowSeconds}
                />
              </div>
            )}
          </div>

          {/* Inclusion of Low-Kill Players */}
          <div className="flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8">
            <span className="text-body-strong">
              Inclusão de Jogadores com Menos Kills (Para Todos Aparecerem no Highlight):
            </span>
            <Checkbox
              label="Garantir que todos os jogadores selecionados apareçam no vídeo (mesmo sem atingir o mínimo de kills)"
              isChecked={guaranteeAllPlayers}
              onChange={(e) => setGuaranteeAllPlayers(e.target.checked)}
            />
            {guaranteeAllPlayers && (
              <Select
                label="Quantidade mínima de melhores lances garantidos por jogador"
                options={minSequencesPerPlayerOptions}
                value={minSequencesPerPlayer}
                onChange={setMinSequencesPerPlayer}
              />
            )}
            <Checkbox
              label="Critério adaptativo: reduzir exigência de kills no round para jogadores na metade inferior do placar"
              isChecked={adaptiveThresholdForLowFraggers}
              onChange={(e) => setAdaptiveThresholdForLowFraggers(e.target.checked)}
            />
          </div>

          {/* Special Kill Attributes */}
          <div className="flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8">
            <span className="text-body-strong">Filtros de Abates Especiais & Lances Divertidos:</span>
            <div className="grid grid-cols-3 gap-8">
              <Checkbox
                label="Headshot (HS)"
                isChecked={specialFilters.onlyHeadshot}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyHeadshot: e.target.checked })}
              />
              <Checkbox
                label="No-Scope"
                isChecked={specialFilters.onlyNoScope}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyNoScope: e.target.checked })}
              />
              <Checkbox
                label="Através da Smoke"
                isChecked={specialFilters.onlyThroughSmoke}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyThroughSmoke: e.target.checked })}
              />
              <Checkbox
                label="Wallbang (Varado)"
                isChecked={specialFilters.onlyWallbang}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyWallbang: e.target.checked })}
              />
              <Checkbox
                label="No Ar (Airborne)"
                isChecked={specialFilters.onlyAirborne}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyAirborne: e.target.checked })}
              />
              <Checkbox
                label="Cego de Flash"
                isChecked={specialFilters.onlyBlind}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyBlind: e.target.checked })}
              />
              <Checkbox
                label="First Kill (Entry)"
                isChecked={specialFilters.onlyEntryKill}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyEntryKill: e.target.checked })}
              />
              <Checkbox
                label="Faca / Zeus / HE / Molotov"
                isChecked={specialFilters.onlyUtilityOrKnife}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyUtilityOrKnife: e.target.checked })}
              />
              <Checkbox
                label="Trade Kill (Vingança)"
                isChecked={specialFilters.onlyTradeKill}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyTradeKill: e.target.checked })}
              />
              <Checkbox
                label="Plantou / Defusou C4"
                isChecked={specialFilters.onlyBombAction}
                onChange={(e) => setSpecialFilters({ ...specialFilters, onlyBombAction: e.target.checked })}
              />
            </div>
            <Select
              label="Modo dos atributos especiais"
              options={specialModeOptions}
              value={specialFilters.mode}
              onChange={(mode) => setSpecialFilters({ ...specialFilters, mode })}
            />
          </div>

          {/* Rounds & Weapons */}
          <RoundsSelect rounds={match.rounds} selectedRoundNumbers={selectedRounds} onChange={setSelectedRounds} />

          {visibleWeapons.length > 0 && (
            <WeaponsFilter
              weapons={visibleWeapons}
              selectedWeapons={selectedWeapons}
              hasActiveFilter={selectedWeapons.length > 0 && selectedWeapons.length !== visibleWeapons.length}
              onChange={setSelectedWeapons}
            />
          )}

          {/* Timing & Sequence Merging */}
          <div className="grid grid-cols-3 gap-8 rounded-4 border border-gray-400 p-8">
            <SecondsInput
              label="Segundos antes do lance"
              defaultValue={startSecondsBeforeEvent}
              onChange={setStartSecondsBeforeEvent}
            />
            <SecondsInput
              label="Segundos após o lance"
              defaultValue={endSecondsAfterEvent}
              onChange={setEndSecondsAfterEvent}
            />
            <SecondsInput
              label="Agrupar lances próximos (máx. s)"
              defaultValue={maxSecondsBetweenEvents}
              onChange={setMaxSecondsBetweenEvents}
            />
          </div>

          {/* HUD Overlay, 8s Intro, 5s Outro, Kill Counter, Slow Motion & Smooth Fade Transitions */}
          <div className="flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8">
            <span className="text-body-strong">
              Intro (8s), Encerramento (5s), HUD, Contador de Kills & Câmera Lenta:
            </span>
            <Select
              label='Posição do Nome na Tela (Formato: POV: Nome do Jogador - Round X)'
              options={hudPositionOptions}
              value={hudPosition}
              onChange={async (pos) => {
                setHudPosition(pos);
                await updateSettings({
                  ...({ hudPosition: pos } as unknown as Partial<typeof settings>),
                });
              }}
            />
            <Checkbox
              label="Contador de kills animado no HUD (1K, Double, Triple, Ace, Clutches e Armas)"
              isChecked={enableKillCounter}
              onChange={async (e) => {
                const checked = e.target.checked;
                setEnableKillCounter(checked);
                await updateSettings({
                  ...({ enableKillCounter: checked } as unknown as Partial<typeof settings>),
                });
              }}
            />
            <Checkbox
              label="Câmera lenta (Slow Motion 0.5x) em abates épicos (No-Scope, Faca, Wallbang e Clutches)"
              isChecked={enableSlowMotion}
              onChange={async (e) => {
                const checked = e.target.checked;
                setEnableSlowMotion(checked);
                await updateSettings({
                  ...({ enableSlowMotion: checked } as unknown as Partial<typeof settings>),
                });
              }}
            />
            <Checkbox
              label="Incluir tela de introdução no início do vídeo (8s com Mapa, Placar Final e Tabela KDA dos Times)"
              isChecked={showIntroScreen}
              onChange={async (e) => {
                const checked = e.target.checked;
                setShowIntroScreen(checked);
                await updateSettings({
                  ...({ showIntroScreen: checked } as unknown as Partial<typeof settings>),
                });
              }}
            />
            <Checkbox
              label="Incluir tela de encerramento no final do vídeo (Outro de 5s com MVP e Destaques da Partida)"
              isChecked={showOutroScreen}
              onChange={async (e) => {
                const checked = e.target.checked;
                setShowOutroScreen(checked);
                await updateSettings({
                  ...({ showOutroScreen: checked } as unknown as Partial<typeof settings>),
                });
              }}
            />
            <Checkbox
              label="Transição suave (Fade-In / Fade-Out em vídeo e áudio) entre uma sequência e outra"
              isChecked={enableSequenceTransitions}
              onChange={async (e) => {
                const checked = e.target.checked;
                setEnableSequenceTransitions(checked);
                await updateSettings({
                  ...({ enableSequenceTransitions: checked } as unknown as Partial<typeof settings>),
                });
              }}
            />
          </div>

          <div className="flex flex-col gap-y-8 rounded-4 border border-gray-400 p-8">
            <Checkbox
              label="Gravar com o CS oculto em 2º plano (Posiciona a janela fora da tela sem roubar o foco do PC)"
              isChecked={hideGameWindow}
              onChange={async (e) => {
                const checked = e.target.checked;
                setHideGameWindow(checked);
                await updateSettings({
                  ...({ hideGameWindow: checked } as unknown as Partial<typeof settings>),
                });
              }}
            />
            <Checkbox
              label="Manter sequências já existentes na timeline"
              isChecked={preserveExistingSequences}
              onChange={(e) => setPreserveExistingSequences(e.target.checked)}
            />
          </div>

          {/* Live Summary Banner */}
          <div className="flex items-center justify-between rounded-4 bg-gray-200 p-12">
            <div className="flex flex-col">
              <span className="text-body-strong">
                Resumo da Timeline: {finalSequences.length} sequência(s){showIntroScreen ? ' + Intro (8s)' : ''}
                {showOutroScreen ? ' + Outro (5s)' : ''} | Jogadores contemplados: {includedPlayersCount} de{' '}
                {selectedSteamIds.length}
              </span>
              <span className="text-caption">
                Duração estimada: {formatDuration(totalDurationSeconds)} | Codec GPU: {settings.ffmpegSettings.videoCodec}{' '}
                | HUD: {hudPosition === 'none' ? 'Desativado' : hudPosition}{' '}
                {enableKillCounter ? '(Contador Ativo)' : ''} | Slow-Mo: {enableSlowMotion ? '0.5x' : 'Off'} | Transições:{' '}
                {enableSequenceTransitions ? 'Fade Suave' : 'Corte Seco'}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button
          variant={ButtonVariant.Primary}
          onClick={applyTimelineAndRecordNow}
          isDisabled={finalSequences.length === 0 || isStartingRecording}
        >
          Montar Timeline e Gravar Agora ({finalSequences.length})
        </Button>
        <Button onClick={applyTimelineOnly} isDisabled={finalSequences.length === 0 || isStartingRecording}>
          Apenas Montar Timeline
        </Button>
        <CancelButton onClick={hideDialog} />
      </DialogFooter>
    </Dialog>
  );
}

export function GenerateMatchHighlightsButton() {
  const { showDialog } = useDialog();

  const onClick = () => {
    showDialog(<GenerateMatchHighlightsDialog />);
  };

  return (
    <Button variant={ButtonVariant.Primary} onClick={onClick}>
      Gerar Highlights da Partida
    </Button>
  );
}
