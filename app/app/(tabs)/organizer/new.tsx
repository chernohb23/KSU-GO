import * as ImagePicker from 'expo-image-picker';
import { fetch as fetchLocal } from 'expo/fetch';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import events from '../../../../shared/fixtures/events.seed.json';
import type { UploadRouteInput } from '../../../src/api/client';
import { useAppData } from '../../../src/data/AppDataContext';
import { useOrganizer } from '../../../src/organizer/context';
import { defaultDestinationFloor, selectedVideoFile, uploadInput } from '../../../src/organizer/form';
import { createVideoPicker } from '../../../src/organizer/picker';
import { Action, buildingName, ProgressBar, styles } from '../../../src/organizer/ui';

// Keep the original recording, including full-resolution room signs.
const PICK_VIDEO: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['videos'],
  allowsEditing: false,
  videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
};

const filmingRules = [
  'Use 1080p at 30 fps with HDR off.',
  'Film one continuous take under 3 minutes, from outside the entrance to the room door.',
  'Hold the phone upright at chest height. Walk steadily through turns and keep stairs in view as you climb without stopping.',
  'Pause for one second on each floor and room sign. At the door, fill a third of the frame with the room number for two seconds.',
  'Film an empty hallway or ask the people in it first. Avoid standing still to pan or spin.',
];

function NewRouteForm({ initial }: { initial: UploadRouteInput | null }) {
  const router = useRouter();
  const { serverUrl } = useAppData();
  const { session } = useOrganizer();
  const [eventId, setEventId] = useState(initial?.eventId ?? '');
  const [choosingEvent, setChoosingEvent] = useState(false);
  const [startFloor, setStartFloor] = useState(initial?.startFloor ?? '1');
  const [endFloor, setEndFloor] = useState(initial?.destinationFloor ?? '');
  const [file, setFile] = useState(initial?.video ?? null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const event = events.find((item) => item.id === eventId);

  const [selectVideo] = useState(() => createVideoPicker({
    readFile: (asset) => selectedVideoFile(asset, fetchLocal), setFile, setError, setPicking,
  }));

  useEffect(() => {
    if (Platform.OS === 'android') {
      void selectVideo('restore', ImagePicker.getPendingResultAsync);
    }
  }, [selectVideo]);

  function submit() {
    if (!event || !file) return;
    try {
      const input = uploadInput(event, startFloor, endFloor, file);
      void session.upload(input);
    } catch (cause) {
      if (cause instanceof Error) setError(cause.message);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>New route</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Event</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: choosingEvent }} style={styles.card}
          onPress={() => setChoosingEvent(!choosingEvent)}>
          <Text style={styles.label}>{event?.title ?? 'Choose an event'}</Text>
          {event && <Text style={styles.body}>{buildingName(event.location.buildingId)} · Room {event.location.room}</Text>}
        </Pressable>
        {choosingEvent && events.map((option) => (
          <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: option.id === eventId }}
            style={styles.card} onPress={() => {
              setEventId(option.id);
              setEndFloor(defaultDestinationFloor(option.location.room));
              setChoosingEvent(false);
              setError('');
            }}>
            <Text style={styles.label}>{option.title}</Text>
            <Text style={styles.body}>{buildingName(option.location.buildingId)} · Room {option.location.room}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>Start floor</Text>
          <TextInput accessibilityLabel="Start floor" style={styles.input} keyboardType="numbers-and-punctuation"
            value={startFloor} onChangeText={setStartFloor} />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>Destination floor</Text>
          <TextInput accessibilityLabel="Destination floor" style={styles.input} keyboardType="numbers-and-punctuation"
            value={endFloor} onChangeText={setEndFloor} />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Walkthrough video</Text>
        <Text style={styles.body}>{file?.name ?? 'Up to 3 minutes and 100 MB.'}</Text>
        <Action label={picking ? 'Opening camera roll…' : file ? 'Change video' : 'Choose video'} secondary
          disabled={picking} onPress={() => { void selectVideo('choose', () => ImagePicker.launchImageLibraryAsync(PICK_VIDEO)); }} />
      </View>
      {error && <Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
      {!serverUrl && <Action label="Set server address" secondary onPress={() => router.push('/settings')} />}
      <Action label="Upload video" disabled={!serverUrl || !event || !file || picking} onPress={submit} />
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Filming guide</Text>
        {filmingRules.map((rule) => <Text key={rule} style={styles.body}>{rule}</Text>)}
      </View>
      <Action label="Back to drafts" secondary onPress={() => router.dismissTo('/organizer')} />
    </ScrollView>
  );
}

export default function NewRouteScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { session, transfer } = useOrganizer();
  const [initial, setInitial] = useState<UploadRouteInput | null>(null);
  const acceptedId = transfer?.phase === 'accepted' ? transfer.routeId : null;
  useEffect(() => {
    if (focused && acceptedId) router.replace({ pathname: '/organizer/[routeId]', params: { routeId: acceptedId } });
  }, [focused, acceptedId, router]);

  if (!transfer) return <NewRouteForm initial={initial} />;
  if (transfer.phase === 'accepted') return <Text style={styles.content}>Opening route…</Text>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>{transfer.input.destination}</Text>
      <Text style={styles.body}>{transfer.input.video.name}</Text>
      {transfer.phase === 'uploading' ? (
        <>
          <ProgressBar label="Uploading video" percent={transfer.percent} />
          <Text style={styles.body}>You can open another draft while this video uploads.</Text>
        </>
      ) : (
        <>
          <Text accessibilityRole="alert" style={styles.notice}>{transfer.message}</Text>
          <Action label="Retry upload" onPress={() => { void session.upload(transfer.input); }} />
          <Action label="Change upload" secondary onPress={() => { setInitial(transfer.input); session.clearTransfer(); }} />
        </>
      )}
      <Action label="Back to drafts" secondary onPress={() => router.dismissTo('/organizer')} />
    </ScrollView>
  );
}
