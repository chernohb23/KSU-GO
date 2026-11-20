import type { EventDirections } from '../../../shared/types.ts';

/** The same five states returned by the server; confirmed directions are view only. */
export function directionsRow(state: EventDirections['state']): { label: string; action: 'view' | 'upload' | 'review' | null } {
  switch (state) {
    case 'confirmed': return { label: 'Directions ready', action: 'view' };
    case 'none': return { label: 'Add directions', action: 'upload' };
    case 'processing': return { label: 'Directions in progress', action: null };
    case 'draft': return { label: 'Review draft', action: 'review' };
    case 'failed': return { label: 'Try again', action: 'upload' };
  }
}
