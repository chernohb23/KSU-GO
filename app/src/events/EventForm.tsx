import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import campusJson from '../../../shared/fixtures/campus.json';
import type { Campus, Event, Organization } from '../../../shared/types.ts';
import { categoryLabel } from '../account/insights';
import { radius, space, text, tone } from '../navigation/theme';
import { Button, Chip, ChipRow, Field, Group, Notice, Row, Section } from '../ui/controls';
import { et } from './format';
import {
  addTag, dayChipLabel, DURATIONS, eventRequestFields, formProblem, nextDays, timeSlots,
  type CampusDay, type EventFormValues,
} from './form';

const campus = campusJson as Campus;
const CATEGORIES: Event['category'][] = ['academic', 'social', 'career', 'sports', 'arts', 'other'];

type Fields = ReturnType<typeof eventRequestFields>;

/** Create or edit an event. Times are campus time (ET); the server checks every rule. */
export function EventForm({ initial, host, organizations, now, submitLabel, onSubmit }: {
  initial: Event | null; host: Organization; organizations: Organization[]; now: Date;
  submitLabel: string; onSubmit(fields: Fields): Promise<void>;
}) {
  const days = useMemo(() => nextDays(now), [now]);
  const initialDuration = initial ? Math.round((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 60_000) : 60;
  const [values, setValues] = useState<EventFormValues>({
    title: initial?.title ?? '', description: initial?.description ?? '', category: initial?.category ?? null,
    buildingId: initial?.location.buildingId ?? null, room: initial?.location.room ?? '',
    startsAt: null, durationMin: initialDuration, capacity: initial?.capacity ? String(initial.capacity) : '',
    partnerOrganizationId: initial?.partnerOrganizationId ?? null, tags: initial?.tags ?? [],
  });
  const [dayIndex, setDayIndex] = useState<number | null>(initial ? null : 0);
  const [tagDraft, setTagDraft] = useState('');
  const [choosing, setChoosing] = useState<'building' | 'partner' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (change: Partial<EventFormValues>) => { setError(null); setValues((v) => ({ ...v, ...change })); };
  const slots = dayIndex === null ? [] : timeSlots(days[dayIndex] as CampusDay, now);
  const customDuration = !(DURATIONS as readonly number[]).includes(values.durationMin);

  async function submit() {
    const problem = formProblem(values, initial !== null);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onSubmit(eventRequestFields(values, initial?.startsAt ?? null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the event. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const building = campus.buildings.find((b) => b.id === values.buildingId);
  const partner = organizations.find((o) => o.id === values.partnerOrganizationId);

  return (
    <View style={styles.root}>
      <Section label="What">
        <Group>
          <Field label="Title" value={values.title} onChangeText={(title) => set({ title })} maxLength={120} editable={!busy} />
          <Field label="Description" value={values.description} onChangeText={(description) => set({ description })}
            multiline maxLength={2000} editable={!busy} last />
        </Group>
        <ChipRow>
          {CATEGORIES.map((category) => (
            <Chip key={category} label={categoryLabel(category)} selected={values.category === category}
              onPress={() => set({ category })} />
          ))}
        </ChipRow>
      </Section>

      <Section label="Where">
        <Group>
          <Row label="Building" value={building?.name ?? 'Choose'} onPress={() => setChoosing(choosing === 'building' ? null : 'building')} />
          {choosing === 'building' ? campus.buildings.map((b) => (
            <Row key={b.id} label={b.name} accessory={values.buildingId === b.id ? <Text style={styles.check}>✓</Text> : undefined}
              onPress={() => { set({ buildingId: b.id }); setChoosing(null); }} />
          )) : null}
          <Field label="Room" value={values.room} onChangeText={(room) => set({ room })} maxLength={40}
            placeholder="113, or a name like Atrium" editable={!busy} last />
        </Group>
      </Section>

      <Section label="When (ET)" footer={initial && dayIndex === null ? `Keeps ${et.dateTime(initial.startsAt)} unless you pick a new time.` : 'Events start within the next seven days.'}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
          {days.map((day, index) => {
            const label = dayChipLabel(day, index);
            const selected = dayIndex === index;
            return (
              <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected }}
                onPress={() => { setDayIndex(index); set({ startsAt: null }); }}
                style={[styles.day, selected && styles.daySelected]}>
                <Text style={[styles.dayTop, selected && styles.onInk]}>{label.top}</Text>
                <Text style={[styles.dayBottom, selected && styles.onInk]}>{label.bottom}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {dayIndex !== null ? (
          slots.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
              {slots.map((slot) => (
                <Chip key={slot.iso} label={slot.label} selected={values.startsAt === slot.iso} onPress={() => set({ startsAt: slot.iso })} />
              ))}
            </ScrollView>
          ) : <Text style={[text.footnote, styles.pad]}>No start times left on this day.</Text>
        ) : null}
        <ChipRow>
          {DURATIONS.map((minutes) => (
            <Chip key={minutes} label={minutes < 60 ? `${minutes} min` : `${minutes / 60}${minutes % 60 ? '.5' : ''} h`}
              selected={values.durationMin === minutes} onPress={() => set({ durationMin: minutes })} />
          ))}
          <Chip label={customDuration ? `${values.durationMin} min` : 'Custom'} selected={customDuration}
            onPress={() => set({ durationMin: customDuration ? 60 : 45 })} />
        </ChipRow>
        {customDuration ? (
          <Group>
            <Field label="Duration in minutes (1 to 1440)" value={String(values.durationMin)} keyboardType="number-pad" last
              onChangeText={(value) => set({ durationMin: Number(value.replace(/\D/g, '')) || 0 })} />
          </Group>
        ) : null}
      </Section>

      <Section label="Who" footer={`Hosted by ${host.name}. A partner organization is shown on the event too.`}>
        <Group>
          <Row label="Partner" value={partner?.name ?? 'None'} onPress={() => setChoosing(choosing === 'partner' ? null : 'partner')} />
          {choosing === 'partner' ? [null, ...organizations.filter((o) => o.id !== host.id)].map((o) => (
            <Row key={o?.id ?? 'none'} label={o?.name ?? 'None'}
              accessory={values.partnerOrganizationId === (o?.id ?? null) ? <Text style={styles.check}>✓</Text> : undefined}
              onPress={() => { set({ partnerOrganizationId: o?.id ?? null }); setChoosing(null); }} />
          )) : null}
          <Field label="Capacity (leave empty for none)" value={values.capacity} keyboardType="number-pad"
            onChangeText={(capacity) => set({ capacity: capacity.replace(/\D/g, '') })} last />
        </Group>
      </Section>

      <Section label="Tags" footer="Up to 8. Capacity is shown on the event, never enforced.">
        <Group>
          <Field label="Add a tag" value={tagDraft} onChangeText={setTagDraft} autoCapitalize="none" returnKeyType="done"
            onSubmitEditing={() => { set({ tags: addTag(values.tags, tagDraft) }); setTagDraft(''); }} last />
        </Group>
        {values.tags.length ? (
          <ChipRow>
            {values.tags.map((tag) => (
              <Chip key={tag} label={`${tag}  ✕`} selected={false} onPress={() => set({ tags: values.tags.filter((t) => t !== tag) })} />
            ))}
          </ChipRow>
        ) : null}
      </Section>

      <Notice message={error} />
      <Button label={submitLabel} busy={busy} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },
  days: { gap: space.s, paddingRight: space.gutter },
  day: { width: 64, paddingVertical: space.s, borderRadius: radius.control, alignItems: 'center', gap: 2,
    backgroundColor: tone.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  daySelected: { backgroundColor: tone.ink, borderColor: tone.ink },
  dayTop: { ...text.footnote, color: tone.ink, fontWeight: '600' },
  dayBottom: { ...text.subhead, color: tone.ink, fontVariant: ['tabular-nums'] },
  onInk: { color: tone.paper },
  check: { color: tone.amber, fontSize: 17, fontWeight: '600' },
  pad: { paddingHorizontal: space.l },
});
