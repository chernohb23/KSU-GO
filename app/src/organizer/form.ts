import type { ImagePickerAsset } from 'expo-image-picker';
import type { Event } from '../../../shared/types.ts';
import type { UploadRouteInput } from '../api/client.ts';
import { roomLabel } from '../../../shared/rooms.ts';

type VideoAsset = Pick<ImagePickerAsset, 'uri' | 'fileName' | 'mimeType' | 'fileSize' | 'duration'>;
type VideoFile = UploadRouteInput['video'];
const MAX_VIDEO_BYTES = 100_000_000;

export function videoFile(asset: VideoAsset): VideoFile {
  const { duration, fileSize } = asset;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('Could not read the video duration. Choose a video saved on this device.');
  }
  if (duration > 180_000) throw new Error('Choose a video that is 3 minutes or shorter.');
  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error('Could not read the video size. Choose a video saved on this device.');
  }
  if (fileSize > MAX_VIDEO_BYTES) throw new Error('Choose a video that is 100 MB or smaller.');
  const name = asset.fileName || asset.uri.split('?')[0].split('/').pop() || 'walk.mp4';
  const type = asset.mimeType || (name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
  return { uri: asset.uri, name, type };
}

// Some Android photo providers omit SIZE even though the picker made a local copy.
export async function selectedVideoFile(
  asset: VideoAsset, fetchLocal: (uri: string, init: { signal: AbortSignal }) => Promise<Response>,
): Promise<VideoFile> {
  if ((asset.fileSize ?? 0) > 0 || !asset.uri.startsWith('file://')) return videoFile(asset);
  const abort = new AbortController();
  let bytes = 0;
  try {
    const response = await fetchLocal(asset.uri, { signal: abort.signal });
    if (response.ok) {
      bytes = Number(response.headers.get('content-length')) || 0;
      if (bytes <= 0 && response.body) {
        const reader = response.body.getReader();
        while (bytes <= MAX_VIDEO_BYTES) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
        }
      }
    }
  } catch {
    bytes = 0;
  } finally {
    abort.abort();
  }
  return videoFile({ ...asset, fileSize: bytes });
}

export function defaultDestinationFloor(room: string): string {
  return room.match(/\d/)?.[0] ?? '';
}

export function uploadInput(
  event: Pick<Event, 'id' | 'location'>, start: string, end: string, video: VideoFile,
): UploadRouteInput {
  const startFloor = start.trim();
  const destinationFloor = end.trim();
  if (![startFloor, destinationFloor].every((floor) => /^-?\d+$/.test(floor))) {
    throw new Error('Enter a whole number for each floor.');
  }
  return {
    eventId: event.id, buildingId: event.location.buildingId, destination: roomLabel(event.location.room),
    startFloor, destinationFloor, video,
  };
}
