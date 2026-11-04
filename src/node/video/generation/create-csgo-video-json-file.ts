import { JSONActionsFileGenerator } from 'csdm/node/counter-strike/json-actions-file/json-actions-file-generator';
import type { Sequence } from 'csdm/common/types/sequence';
import { getSequenceName } from 'csdm/node/video/generation/get-sequence-name';
import { windowsToUnixPathSeparator } from 'csdm/node/filesystem/windows-to-unix-path-separator';
import { Game } from 'csdm/common/types/counter-strike';
import type { SequencePlayerOptions } from 'csdm/common/types/sequence-player-options';
import { RecordingSystem } from 'csdm/common/types/recording-system';
import { RecordingOutput } from 'csdm/common/types/recording-output';
import { EncoderSoftware } from 'csdm/common/types/encoder-software';
import type { VideoContainer } from 'csdm/common/types/video-container';
import { lastArrayItem } from 'csdm/common/array/last-array-item';

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
  tickrate: number;
  ffmpegSettings: {
    constantRateFactor: number;
    videoContainer: VideoContainer;
    videoCodec: string;
    outputParameters: string;
  };
};

function getHlaeOutputFolderPath(outputFolderPath: string, sequence: Sequence) {
  return `${windowsToUnixPathSeparator(outputFolderPath)}/${getSequenceName(sequence)}`;
}

function buildReplacePlayerNameCommand(player: SequencePlayerOptions) {
  return `mirv_exec mirv_replace_name filter add x${player.steamId} "${player.playerName.replaceAll('"', '{QUOTE}')}"`;
}

function buildFfmpegPresetParameters(ffmpegSettings: Options['ffmpegSettings']) {
  const codec = ffmpegSettings.videoCodec.trim();
  const codecLower = codec.toLowerCase();
  let presetParameters = `-y -c:v ${codec}`;
  if (ffmpegSettings.outputParameters !== '') {
    presetParameters += ` ${ffmpegSettings.outputParameters}`;
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

export async function createCsgoVideoJsonFile({
  type,
  recordingSystem,
  recordingOutput,
  encoderSoftware,
  outputFolderPath,
  framerate,
  demoPath,
  sequences,
  closeGameAfterRecording,
  tickrate,
  ffmpegSettings,
}: Options) {
  const json = new JSONActionsFileGenerator(demoPath, Game.CSGO);
  const mandatoryCommands = [
    'sv_cheats 1',
    'volume 1',
    'net_graph 0',
    'fps_max 0',
    'mat_queue_mode 2',
    'engine_no_focus_sleep 0',
    'host_timescale 0',
    'mirv_snd_timescale 1',
    'mirv_gameoverlay enable 0',
  ];

  const firstActionsTick = Math.min(tickrate, 128);
  const roundedTickrate = Math.round(tickrate);

  for (let i = 0; i < sequences.length; i++) {
    const sequence = sequences[i];
    for (const command of mandatoryCommands) {
      json.addExecCommand(firstActionsTick, command);
    }

    json.addExecCommand(firstActionsTick, `cl_draw_only_deathnotices ${sequence.showOnlyDeathNotices ? 1 : 0}`);
    json.addExecCommand(firstActionsTick, `mirv_deathmsg lifetime ${sequence.deathNoticesDuration}`);
    json.addExecCommand(1, 'mirv_deathmsg filter clear');

    if (sequence.playerVoicesEnabled) {
      json.enablePlayerVoices(firstActionsTick);
    } else {
      json.disablePlayerVoices(firstActionsTick);
    }

    const setupSequenceTick =
      sequence.startTick - roundedTickrate > 0 ? sequence.startTick - roundedTickrate : 1;
    const hlaeOutputFolderPath = getHlaeOutputFolderPath(outputFolderPath, sequence);
    const presetName =
      recordingOutput === RecordingOutput.Video && encoderSoftware === EncoderSoftware.FFmpeg
        ? `csdmPreset${sequence.number}`
        : 'afxClassic';

    json
      .addExecCommand(setupSequenceTick, `mirv_streams record startMovieWav ${sequence.recordAudio ? 1 : 0}`)
      .addExecCommand(setupSequenceTick, `mirv_streams record name "${hlaeOutputFolderPath}"`)
      .addExecCommand(setupSequenceTick, 'mirv_replace_name filter clear')
      .addExecCommand(setupSequenceTick, `spec_show_xray ${sequence.showXRay ? 1 : 0}`)
      .addExecCommand(setupSequenceTick, `mp_display_kill_assists ${sequence.showAssists ? 1 : 0}`)
      .addExecCommand(setupSequenceTick, `host_framerate ${framerate}`);

    if (presetName !== 'afxClassic') {
      const presetParameters = buildFfmpegPresetParameters(ffmpegSettings);
      json
        .addExecCommand(
          setupSequenceTick,
          `mirv_streams settings add ffmpeg ${presetName} "${presetParameters} {QUOTE}${hlaeOutputFolderPath}\\\\video.${ffmpegSettings.videoContainer}{QUOTE}"`,
        )
        .addExecCommand(setupSequenceTick, `mirv_streams settings edit afxDefault settings ${presetName}`);
    }

    if (typeof sequence.cfg === 'string') {
      const commands = sequence.cfg.split('\n');
      for (const command of commands) {
        json.addExecCommand(setupSequenceTick, command);
      }
    }

    json.addGoToTick(firstActionsTick, setupSequenceTick);

    for (const camera of sequence.playerCameras) {
      json.addSpecPlayer(camera.tick, camera.playerSteamId);
    }

    json.addExecCommand(setupSequenceTick, 'mirv_deathmsg filter clear');
    if (sequence.playersOptions.length > 0) {
      json.addExecCommand(setupSequenceTick, 'mirv_deathmsg filter add block=1');
    }

    for (const playerOptions of sequence.playersOptions) {
      const replacePlayerNameCommand = buildReplacePlayerNameCommand(playerOptions);
      json.addExecCommand(setupSequenceTick, replacePlayerNameCommand);

      if (playerOptions.showKill) {
        json.addExecCommand(
          setupSequenceTick,
          `mirv_deathmsg filter add attackerMatch=x${playerOptions.steamId} attackerIsLocal=${playerOptions.highlightKill ? '1' : '0'} block=0`,
        );
      }
    }

    if (type === 'record') {
      if (recordingSystem === RecordingSystem.HLAE) {
        json
          .addExecCommand(sequence.startTick, 'mirv_streams add normal defaultNormal')
          .addExecCommand(sequence.startTick, 'mirv_streams record start')
          .addExecCommand(sequence.endTick, 'mirv_streams record end');
      } else {
        json
          .addExecCommand(sequence.startTick, `startmovie ${getSequenceName(sequence)}`)
          .addExecCommand(sequence.endTick, 'endmovie');
      }
    }

    if (i === sequences.length - 1) {
      if (closeGameAfterRecording) {
        json.addExecCommand(lastArrayItem(sequences).endTick + 1, 'quit');
      }
    } else {
      json.addGoToNextSequence(sequence.endTick + roundedTickrate);
    }
  }

  await json.write();
}
