import path from 'node:path';
import fs from 'fs-extra';
import type { Sequence } from 'csdm/common/types/sequence';
import { getSequenceOutputFilePath } from 'csdm/node/video/generation/get-sequence-output-file-path';
import { executeFfmpeg } from 'csdm/node/video/ffmpeg/execute-ffmpeg';
import type { VideoContainer } from 'csdm/common/types/video-container';
import { sortSequencesByNumber } from 'csdm/common/video/sequences/sort-sequences-by-number';

type ConcatenateVideoOptions = {
  ffmpegExecutablePath: string;
  sequences: Sequence[];
  outputFolderPath: string;
  videoContainer: VideoContainer;
  fileName: string;
  introVideoPath?: string;
  outroVideoPath?: string;
};

export async function concatenateVideosFromSequences(
  {
    ffmpegExecutablePath,
    sequences,
    outputFolderPath,
    videoContainer,
    fileName,
    introVideoPath,
    outroVideoPath,
  }: ConcatenateVideoOptions,
  signal: AbortSignal,
) {
  const sortedSequences = sortSequencesByNumber(sequences);
  const allVideoPaths: string[] = [];
  if (introVideoPath) {
    allVideoPaths.push(introVideoPath);
  } else {
    const defaultIntroPath = path.join(outputFolderPath, `intro-0.${videoContainer}`);
    if (await fs.pathExists(defaultIntroPath)) {
      allVideoPaths.push(defaultIntroPath);
    }
  }
  for (const sequence of sortedSequences) {
    allVideoPaths.push(getSequenceOutputFilePath(outputFolderPath, sequence, videoContainer));
  }
  if (outroVideoPath) {
    allVideoPaths.push(outroVideoPath);
  } else {
    const defaultOutroPath = path.join(outputFolderPath, `outro-0.${videoContainer}`);
    if (await fs.pathExists(defaultOutroPath)) {
      allVideoPaths.push(defaultOutroPath);
    }
  }

  const videoPaths: string[] = [];
  for (const videoPath of allVideoPaths) {
    if (await fs.pathExists(videoPath)) {
      videoPaths.push(videoPath);
    }
  }
  if (videoPaths.length === 0) {
    return;
  }

  const outputFilePath = path.join(outputFolderPath, `${fileName}.${videoContainer}`);
  if (videoPaths.length === 1) {
    await fs.move(videoPaths[0], outputFilePath, { overwrite: true });
    return;
  }

  const listFilePath = path.join(outputFolderPath, 'videos.txt');
  await fs.writeFile(
    listFilePath,
    videoPaths
      .map((filePath) => {
        const normalizedPath = filePath.replaceAll('\\', '/').replaceAll("'", "'\\''");
        return `file '${normalizedPath}'`;
      })
      .join('\n'),
    'utf8',
  );

  try {
    const args =
      videoContainer === 'mp4'
        ? [
            '-y',
            '-fflags +genpts',
            '-f concat',
            '-safe 0',
            `-i "${listFilePath}"`,
            '-c:v copy',
            '-c:a aac',
            '-b:a 256K',
            '-af "aresample=async=1:first_pts=0"',
            '-movflags +faststart',
            `"${outputFilePath}"`,
          ]
        : ['-y', '-fflags +genpts', '-f concat', '-safe 0', `-i "${listFilePath}"`, '-c copy', `"${outputFilePath}"`];
    await executeFfmpeg(ffmpegExecutablePath, args, signal);
  } catch {
    const fallbackArgs = [
      '-y',
      '-fflags +genpts',
      '-f concat',
      '-safe 0',
      `-i "${listFilePath}"`,
      '-c copy',
      `"${outputFilePath}"`,
    ];
    await executeFfmpeg(ffmpegExecutablePath, fallbackArgs, signal);
  } finally {
    await fs.remove(listFilePath);
  }

  await Promise.all(videoPaths.map((videoPath) => fs.remove(videoPath)));
}
