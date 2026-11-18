import { StyleSheet, Text, View } from 'react-native';

export default function RouteScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Route</Text>
      <Text style={styles.body}>Choose an event to view its indoor route.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f7f8' },
  title: { color: '#17212a', fontSize: 24, fontWeight: '700' },
  body: { color: '#53616c', marginTop: 8, fontSize: 15 },
});
