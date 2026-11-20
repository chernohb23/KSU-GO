import * as Haptics from 'expo-haptics';
import { AppState } from 'react-native';

export type HapticKind = 'light' | 'selection' | 'success';

/** One owner per action; unsupported hardware and background work stay silent. */
export function haptic(kind: HapticKind): void {
  if (AppState.currentState !== 'active') return;
  try {
    const request = kind === 'selection' ? Haptics.selectionAsync()
      : kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void request.catch(() => {});
  } catch { /* Haptics must never interrupt an action. */ }
}
