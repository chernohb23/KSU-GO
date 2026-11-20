import { useEffect, useState } from 'react';

import type { Event } from '../../../shared/types';
import { Chip, ChipRow, Notice, Section } from '../ui/controls';
import { useAccount } from './AccountProvider';
import { categoryLabel } from './insights';
import { CATEGORIES, INTERESTS_KEY, parseInterests, toggleInterest } from './preferences';

/** Edits live in account-scoped phone storage, starting from the activity suggestions. */
export function Interests({ suggested }: { suggested: Event['category'][] }) {
  const { storage } = useAccount();
  const [selected, setSelected] = useState<Event['category'][] | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void storage.getItem(INTERESTS_KEY).then((raw) => {
      if (active) { setSelected(parseInterests(raw)); setReady(true); }
    }).catch(() => { if (active) setError('Could not load interests.'); });
    return () => { active = false; };
  }, [storage]);
  const values = selected ?? suggested;
  async function toggle(category: Event['category']) {
    const next = toggleInterest(values, category);
    setBusy(true);
    try { await storage.setItem(INTERESTS_KEY, JSON.stringify(next)); setSelected(next); setError(null); }
    catch { setError('Could not save interests. Try again.'); }
    finally { setBusy(false); }
  }
  return <Section label="Interests">
    <ChipRow>{CATEGORIES.map((category) => <Chip key={category} label={categoryLabel(category)} selected={values.includes(category)}
      disabled={!ready || busy} onPress={() => void toggle(category)} />)}</ChipRow>
    <Notice message={error} />
  </Section>;
}
