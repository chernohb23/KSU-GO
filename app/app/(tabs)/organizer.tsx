import { StyleSheet, Text, View } from 'react-native';

export default function OrganizerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Organizer</Text>
      <Text style={styles.body}>Route drafting and review tools will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f7f8' },
  title: { color: '#17212a', fontSize: 24, fontWeight: '700' },
  body: { color: '#53616c', marginTop: 8, fontSize: 15 },
});
