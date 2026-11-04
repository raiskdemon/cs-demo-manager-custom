import type { Sequence } from 'csdm/common/types/sequence';
import { getSequenceName } from 'csdm/node/video/generation/get-sequence-name';
import { JSONActionsFileGenerator } from 'csdm/node/counter-strike/json-actions-file/json-actions-file-generator';
import { Game } from 'csdm/common/types/counter-strike';
import { generatePlayerVoicesValues } from 'csdm/node/counter-strike/launcher/generate-player-voices-values';
import type { PlayerWatchInfo } from 'csdm/common/types/player-watch-info';
import { windowsToUnixPathSeparator } from 'csdm/node/filesystem/windows-to-unix-path-separator';
import { RecordingOutput } from 'csdm/common/types/recording-output';
import { RecordingSystem } from 'csdm/common/types/recording-system';
import { EncoderSoftware } from 'csdm/common/types/encoder-software';
import type { VideoContainer } from 'csdm/common/types/video-container';
import type { Camera } from 'csdm/common/types/camera';
import { lastArrayItem } from 'csdm/common/array/last-array-item';

function getHlaeOutputFolderPath(outputFolderPath: string, sequence: Sequence) {
  return `${windowsToUnixPathSeparator(outputFolderPath)}/${getSequenceName(sequence)}`;
}

function buildFfmpegPresetParameters(ffmpegSettings: Options['ffmpegSettings']) {
  const codec = ffmpegSettings.videoCodec.trim();
  const codecLower = codec.toLowerCase();
  let presetParameters = `-y -c:v ${codec}`;
  if (ffmpegSettings.outputParameters !== '') {
    presetParameters += ` -pix_fmt yuv420p ${ffmpegSettings.outputParameters}`;
  } else if (codecLower.includes('nvenc')) {
    presetParameters += ` -preset p4 -tune hq -rc vbr -cq ${ffmpegSettings.constantRateFactor} -b:v 0 -pix_fmt yuv420p`;
  } else if (codecLower.includes('amf')) {
    presetParameters += ` -quality quality -rc cqp -qp_i ${ffmpegSettings.constantRateFactor} -qp_p ${ffmpegSettings.constantRateFactor} -pix_fmt yuv420p`;
  } else if (codecLower.includes('qsv')) {
    presetParameters += ` -preset medium -global_quality ${ffmpegSettings.constantRateFactor} -pix_fmt yuv420p`;
  } else if (codecLower.includes('mf')) {
    const quality = Math.max(1, Math.min(100, Math.round((51 - ffmpegSettings.constantRateFactor) * 2)));
    presetParameters += ` -rate_control quality -quality ${quality} -pix_fmt yuv420p`;
  } else {
    presetParameters += ` -pix_fmt yuv420p -crf ${ffmpegSettings.constantRateFactor}`;
  }

  return presetParameters;
}

type Options = {
  type: 'record' | 'watch';
  recordingSystem: RecordingSystem;
  recordingOutput: RecordingOutput;
  encoderSoftware: EncoderSoftware;
  outputFolderPath: string;
  framerate: number;
  demoPath: string;
  sequences: Sequence[];
  closeGameAfterRecording: boolean;
  trueView: boolean;
  tickrate: number;
  players: PlayerWatchInfo[];
  cameras: Camera[];
  ffmpegSettings: {
    constantRateFactor: number;
    videoContainer: VideoContainer;
    videoCodec: string;
    outputParameters: string;
  };
};

export async function createCs2VideoJsonFile({
  type,
  recordingSystem,
  recordingOutput,
  encoderSoftware,
  outputFolderPath,
  framerate,
  demoPath,
  sequences,
  closeGameAfterRecording,
  trueView,
  tickrate,
  players,
  cameras,
  ffmpegSettings,
}: Options) {
  const json = new JSONActionsFileGenerator(demoPath, Game.CS2);

  const mandatoryCommands = [
    'sv_cheats 1',
    'volume 1',
    'fps_max 0',
    'engine_no_focus_sleep 0',
    'cl_hud_telemetry_frametime_show 0',
    'cl_hud_telemetry_net_misdelivery_show 0',
    'cl_hud_telemetry_ping_show 0',
    'cl_hud_telemetry_serverrecvmargin_graph_show 0',
    'cl_trueview_show_status 0',
    'r_show_build_info 0',
    'mirv_streams record screen enabled 1',
    `cl_demo_predict ${trueView ? 1 : 0}`,
  ];

  const roundedTickrate = Math.round(tickrate);
  let isNewPluginSequence = true;

  for (let i = 0; i < sequences.length; i++) {
    const sequence = sequences[i];
    const rawSetupTick = Math.max(1, sequence.startTick - roundedTickrate);
    const setupSequenceTick =
      !isNewPluginSequence && i > 0 && sequence.startTick > sequences[i - 1].endTick + 12
        ? Math.max(sequences[i - 1].endTick + 6, rawSetupTick)
        : rawSetupTick;

    if (isNewPluginSequence) {
      for (const command of mandatoryCommands) {
        json.addExecCommand(1, command);
      }
      json.addGoToTick(1, Math.max(1, setupSequenceTick - 1));
      isNewPluginSequence = false;
    } else {
      const previousSequence = sequences[i - 1];
      if (setupSequenceTick - 1 > previousSequence.endTick + 4) {
        json.addGoToTick(previousSequence.endTick + 2, Math.max(1, setupSequenceTick - 1));
      }
    }

    json.addExecCommand(setupSequenceTick, `cl_draw_only_deathnotices ${sequence.showOnlyDeathNotices ? 1 : 0}`);
    json.addExecCommand(setupSequenceTick, `mirv_deathmsg lifetime ${sequence.deathNoticesDuration}`);

    if (sequence.playerVoicesEnabled) {
      json.enablePlayerVoices(setupSequenceTick);
    } else {
      json.disablePlayerVoices(setupSequenceTick);
    }

    const hlaeOutputFolderPath = getHlaeOutputFolderPath(outputFolderPath, sequence);
    const presetName =
      recordingOutput === RecordingOutput.Video && encoderSoftware === EncoderSoftware.FFmpeg
        ? `csdmPreset${sequence.number}`
        : 'afxClassic';

    json
      .addExecCommand(setupSequenceTick, `mirv_streams record startMovieWav ${sequence.recordAudio ? 1 : 0}`)
      .addExecCommand(setupSequenceTick, `mirv_streams record name "${hlaeOutputFolderPath}"`)
      .addExecCommand(setupSequenceTick, `mirv_deathmsg clear`)
      .addExecCommand(setupSequenceTick, `spec_show_xray ${sequence.showXRay ? 1 : 0}`)
      .addExecCommand(setupSequenceTick, `mp_display_kill_assists ${sequence.showAssists ? 1 : 0}`);

    if (presetName !== 'afxClassic') {
      const presetParameters = buildFfmpegPresetParameters(ffmpegSettings);
      json
        .addExecCommand(
          setupSequenceTick,
          `mirv_streams settings add ffmpeg ${presetName} "${presetParameters} {QUOTE}${hlaeOutputFolderPath}\\\\video.${ffmpegSettings.videoContainer}{QUOTE}"`,
        )
        .addExecCommand(setupSequenceTick, `mirv_streams record screen settings ${presetName}`);
    }

    if (recordingSystem === RecordingSystem.HLAE) {
      json.addExecCommand(setupSequenceTick, `mirv_streams record fps ${framerate}`);
    } else {
      json.addExecCommand(setupSequenceTick, `host_framerate ${framerate}`);
    }

    if (typeof sequence.cfg === 'string') {
      const commands = sequence.cfg.split('\n');
      for (const command of commands) {
        json.addExecCommand(setupSequenceTick, command);
      }
    }

    json.addPausePlayback(Math.max(setupSequenceTick + 1, sequence.startTick - 4));

    for (const camera of sequence.playerCameras) {
      const player = players.find((player) => player.steamId === camera.playerSteamId);
      if (player) {
        json.addSpecPlayer(camera.tick, player.slot);
      }
    }
    for (const { id, tick } of sequence.cameras) {
      const camera = cameras.find((camera) => id === camera.id);
      if (camera) {
        json.addFocusCamera(tick, camera);
      }
    }

    json.addExecCommand(setupSequenceTick, `mirv_deathmsg filter clear`);
    if (sequence.playersOptions.length > 0) {
      // Block all death notices by default and then selectively allow them based on player's options.
      json.addExecCommand(setupSequenceTick, `mirv_deathmsg filter add block=1`);
    }

    for (const playerOptions of sequence.playersOptions) {
      const replacePlayerNameCommand = `mirv_replace_name byXuid add x${playerOptions.steamId} "${playerOptions.playerName}"`;
      json.addExecCommand(setupSequenceTick, replacePlayerNameCommand);

      if (playerOptions.showKill) {
        json.addExecCommand(
          setupSequenceTick,
          `mirv_deathmsg filter add attackerMatch=x${playerOptions.steamId} attackerIsLocal=${playerOptions.highlightKill ? '1' : '0'} block=0`,
        );
      }

      if (playerOptions.isVoiceEnabled) {
        const playersWithVoiceEnabled = sequence.playersOptions.filter((playerOptions) => playerOptions.isVoiceEnabled);
        if (playersWithVoiceEnabled.length !== sequence.playersOptions.length) {
          const userIds: number[] = [];
          for (const playerOptions of playersWithVoiceEnabled) {
            const player = players.find((player) => player.steamId === playerOptions.steamId);
            if (player) {
              userIds.push(player.userId);
            }
          }
          const { valueLow, valueHigh } = generatePlayerVoicesValues(userIds);
          json.addExecCommand(setupSequenceTick, `tv_listen_voice_indices ${valueLow}`);
          json.addExecCommand(setupSequenceTick, `tv_listen_voice_indices_h ${valueHigh}`);
        }
      }
    }

    if (type === 'record') {
      if (recordingSystem === RecordingSystem.HLAE) {
        json
          .addExecCommand(sequence.startTick, `mirv_streams record start`)
          .addExecCommand(sequence.endTick, 'mirv_streams record end');
      } else {
        json
          .addExecCommand(sequence.startTick, `startmovie ${getSequenceName(sequence)}`)
          .addExecCommand(sequence.endTick, 'endmovie');
      }
    }

    if (i === sequences.length - 1) {
      if (closeGameAfterRecording) {
        json.addExecCommand(lastArrayItem(sequences).endTick + 8, 'quit');
      }
    } else {
      json.addGoToNextSequence(sequence.endTick + 64);
    }
  }

  await json.write();
}
