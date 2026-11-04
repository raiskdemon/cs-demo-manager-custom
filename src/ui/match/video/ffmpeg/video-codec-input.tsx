import React from 'react';
import { Trans } from '@lingui/react/macro';
import { useVideoSettings } from 'csdm/ui/settings/video/use-video-settings';
import { TextInput } from 'csdm/ui/components/inputs/text-input';
import { Select, type SelectOption } from 'csdm/ui/components/inputs/select';
import { defaultSettings } from 'csdm/node/settings/default-settings';

const GPU_CODEC_PRESETS: SelectOption<string>[] = [
  { value: 'h264_nvenc', label: 'h264_nvenc (GPU NVIDIA - Rápido)' },
  { value: 'hevc_nvenc', label: 'hevc_nvenc (GPU NVIDIA HEVC)' },
  { value: 'h264_amf', label: 'h264_amf (GPU AMD)' },
  { value: 'h264_qsv', label: 'h264_qsv (GPU Intel)' },
  { value: 'libx264', label: 'libx264 (CPU Padrão)' },
  { value: 'libx265', label: 'libx265 (CPU HEVC)' },
];

export function VideoCodecInput() {
  const { settings, updateSettings } = useVideoSettings();
  const currentCodec = settings.ffmpegSettings.videoCodec;
  const isKnownPreset = GPU_CODEC_PRESETS.some((option) => option.value === currentCodec);
  const selectOptions: SelectOption<string>[] = isKnownPreset
    ? GPU_CODEC_PRESETS
    : [...GPU_CODEC_PRESETS, { value: currentCodec, label: `${currentCodec} (Custom)` }];

  const onBlur = async (event: React.FocusEvent<HTMLInputElement>) => {
    const newVideoCodec = event.target.value.trim();
    if (newVideoCodec === '') {
      event.target.value = defaultSettings.video.ffmpegSettings.videoCodec;
    } else if (newVideoCodec !== settings.ffmpegSettings.videoCodec) {
      await updateSettings({
        ffmpegSettings: {
          videoCodec: newVideoCodec,
        },
      });
    }
  };

  return (
    <div className="flex flex-col gap-y-4">
      <Select
        label={<Trans context="Input label">Video codec</Trans>}
        options={selectOptions}
        value={currentCodec}
        onChange={async (codec) => {
          await updateSettings({
            ffmpegSettings: {
              videoCodec: codec,
            },
          });
        }}
      />
      <TextInput
        key={settings.ffmpegSettings.videoCodec}
        onBlur={onBlur}
        defaultValue={settings.ffmpegSettings.videoCodec}
      />
    </div>
  );
}
