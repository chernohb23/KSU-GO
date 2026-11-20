// One type scale and spacing grid for the app, following the iOS text styles.
// System font (SF Pro) for a native feel; times and counts use tabular figures.

import { StyleSheet } from 'react-native';

import { palette } from './Brand';

export const tone = {
  ...palette,
  surface: '#ffffff',
  hairline: '#dcdfd8',
  fill: '#ecebe4',
  error: '#7a3225',
  danger: '#a52b22',
  goldSoft: '#fff1cc',
};

/** 8-point grid; screens use `gutter` on both sides. */
export const space = { xs: 4, s: 8, m: 12, l: 16, gutter: 20, xl: 24, xxl: 32 };
export const radius = { control: 10, group: 12, sheet: 20 };

export const text = StyleSheet.create({
  largeTitle: { color: tone.ink, fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title: { color: tone.ink, fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: 0.35 },
  headline: { color: tone.ink, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  body: { color: tone.ink, fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  subhead: { color: tone.muted, fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  footnote: { color: tone.muted, fontSize: 13, lineHeight: 18, letterSpacing: -0.08 },
  figures: { fontVariant: ['tabular-nums'] },
});
