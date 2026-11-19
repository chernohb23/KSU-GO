import type { ImagePickerAsset, ImagePickerErrorResult, ImagePickerResult } from 'expo-image-picker';
import type { UploadRouteInput } from '../api/client.ts';

type VideoFile = UploadRouteInput['video'];
type PickerResult = ImagePickerResult | ImagePickerErrorResult | null;
type Source = 'choose' | 'restore';

type PickerForm = {
  readFile(asset: ImagePickerAsset): Promise<VideoFile>;
  setFile(file: VideoFile | null): void;
  setError(message: string): void;
  setPicking(picking: boolean): void;
};

export function createVideoPicker({ readFile, setFile, setError, setPicking }: PickerForm) {
  let recovery: 'available' | 'started' | 'superseded' = 'available';
  let choosing = false;

  return async function select(source: Source, getResult: () => Promise<PickerResult>): Promise<void> {
    const manual = source === 'choose';
    if (manual) {
      if (choosing) return;
      choosing = true;
      setPicking(true);
      setError('');
    } else {
      if (recovery !== 'available') return;
      recovery = 'started';
    }
    const isCurrent = () => manual || recovery !== 'superseded';
    try {
      const result = await getResult();
      if (!isCurrent() || !result) return;
      if ('code' in result) throw new Error(result.message);
      if (result.canceled) return;

      // A cancellation keeps the previous video, including an Android copy still being restored.
      if (manual) {
        recovery = 'superseded';
        setError('');
      }
      setFile(null);
      const file = await readFile(result.assets[0]);
      if (isCurrent()) setFile(file);
    } catch (error) {
      if (isCurrent()) {
        setError(error instanceof Error ? error.message : 'Could not read the selected video. Choose it again from the camera roll.');
      }
    } finally {
      if (manual) {
        choosing = false;
        setPicking(false);
      }
    }
  };
}
