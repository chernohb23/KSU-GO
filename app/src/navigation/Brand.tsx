import { Image, StyleSheet, Text, View } from 'react-native';

export const palette = {
  ink: '#142931', paper: '#f8f7f2', gold: '#ffd064', amber: '#775409', muted: '#475c64',
};

export function BrandMark({ size }: { size: number }) {
  return <Image accessible={false} source={require('../../assets/campus-mark.png')}
    style={{ width: size, height: size, borderRadius: size / 5 }} />;
}

export function LaunchScreen({ label }: { label: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.launch}>
      <BrandMark size={104} />
      <Text style={styles.name}>KSU-GO</Text>
      <Text style={styles.status}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', gap: 8 },
  name: { fontSize: 34, fontWeight: '800', letterSpacing: 1, color: palette.paper },
  status: { color: palette.gold, fontSize: 15, fontWeight: '600' },
});
