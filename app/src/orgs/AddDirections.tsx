import { ScreenScrollView as ScrollView } from '../ui/ScreenScrollView';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';

import { roomLabel } from '../../../shared/rooms';
import type { UploadRouteInput } from '../api/client';
import { text } from '../navigation/theme';
import { useOrganizer } from '../organizer/context';
import { defaultDestinationFloor, selectedVideoFile, uploadInput } from '../organizer/form';
import { createVideoPicker } from '../organizer/picker';
import { buildingName, ProgressBar } from '../organizer/ui';
import { Button, Field, Group, Notice, Section, screenStyles } from '../ui/controls';
import { useManagedEvent } from './useManagedEvent';

// Keep the original video; the server strips metadata before any outside service.
const EXPORT_PRESET = ImagePicker.VideoExportPreset.Passthrough;

export default function AddDirections() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { event, api, canManage, error: loadError } = useManagedEvent(eventId);
  const { session, transfer } = useOrganizer();
  const [file, setFile] = useState<UploadRouteInput['video'] | null>(null);
  const [start, setStart] = useState('1');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const picker = useMemo(() => createVideoPicker({ readFile: (asset) => selectedVideoFile(asset, fetch),
    setFile, setError, setPicking }), []);

  useEffect(() => {
    session.clearTransfer();
    void picker('restore', () => ImagePicker.getPendingResultAsync());
  }, [picker, session]);
  useEffect(() => { if (event) setEnd(defaultDestinationFloor(event.location.room)); }, [event?.location.room]);
  useEffect(() => {
    let active = true;
    if (api && event && canManage) void api.eventDirections(eventId).then((directions) => {
      if (!active) return;
      setAllowed(directions.state === 'none' || directions.state === 'failed');
      if (directions.state === 'confirmed') setError('This room already has directions. Events here use them.');
      else if (directions.state !== 'none' && directions.state !== 'failed') setError('This event already has directions in progress. Open Directions to continue.');
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not check directions.'); });
    return () => { active = false; };
  }, [api, canManage, event, eventId]);

  const currentTransfer = transfer && (transfer.phase === 'accepted' ? submitted : transfer.input.eventId === eventId) ? transfer : null;
  useEffect(() => {
    if (currentTransfer?.phase === 'accepted') router.replace({ pathname: '/organization/event/[eventId]/directions/[routeId]',
      params: { eventId, routeId: currentTransfer.routeId } });
  }, [currentTransfer, eventId, router]);
  const busy = transfer?.phase === 'uploading';

  async function upload() {
    if (!event || !file) return;
    setSubmitted(true);
    try { await session.upload(uploadInput(event, start, end, file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload the video.'); }
  }

  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Add directions' }} />
      <Text style={text.title}>{event?.title ?? 'Directions for this event'}</Text>
      {event ? <Text style={text.subhead}>{buildingName(event.location.buildingId)}, {roomLabel(event.location.room)}</Text> : null}
      <Section label="One continuous walk" footer="Up to 3 minutes and 100 MB. Film an empty hallway, start at the entrance, keep turns visible and finish on the room sign.">
        <Text style={text.body}>The route is drafted by AI from the video and drawn from the step list. You review and confirm it before students see it.</Text>
        <Button label={file ? 'Choose another video' : 'Choose video'} kind="secondary" disabled={busy || !allowed || !canManage} busy={picking}
          onPress={() => void picker('choose', () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'],
            allowsEditing: false, videoExportPreset: EXPORT_PRESET, quality: 1 }))} />
        {file ? <Text style={text.footnote}>{file.name}</Text> : null}
      </Section>
      <Section label="Floors">
        <Group>
          <Field label="Entrance floor" value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" editable={!busy} />
          <Field label="Room floor" value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" editable={!busy} last />
        </Group>
      </Section>
      <Notice message={loadError ?? (error || null)} />
      {currentTransfer?.phase === 'error' ? <Notice message={currentTransfer.message} /> : null}
      {busy && currentTransfer?.phase === 'uploading' ? <ProgressBar label="Uploading video" percent={currentTransfer.percent} /> : null}
      <Button label={currentTransfer?.phase === 'error' ? 'Retry upload' : 'Upload video'} busy={busy}
        disabled={!file || picking || !canManage || !allowed} onPress={() => void upload()} />
    </ScrollView>
  );
}
