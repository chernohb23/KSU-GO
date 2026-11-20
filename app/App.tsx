import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { corridorHtml } from './src/corridorHtml';

type ViewerMessage =
  | { type: 'ready' }
  | { type: 'route:stepChanged'; stepIndex: number }
  | { type: 'error'; message: string };

function readViewerMessage(rawMessage: string): ViewerMessage | null {
  try {
    const value: unknown = JSON.parse(rawMessage);
    if (typeof value !== 'object' || value === null || !('type' in value)) return null;
    if (value.type === 'ready') return { type: 'ready' };
    if (value.type === 'route:stepChanged' && 'stepIndex' in value && typeof value.stepIndex === 'number') {
      return { type: 'route:stepChanged', stepIndex: value.stepIndex };
    }
    if (value.type === 'error' && 'message' in value && typeof value.message === 'string') {
      return { type: 'error', message: value.message };
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  // react-native-webview 13's default generic is undefined, making its props
  // resolve to `never`; `object` keeps the component's declared props usable.
  const webView = useRef<WebView<object>>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [lastMessage, setLastMessage] = useState('Waiting for viewer…');

  function handleMessage(event: WebViewMessageEvent) {
    const message = readViewerMessage(event.nativeEvent.data);
    if (!message) {
      setLastMessage('Viewer sent an unreadable message.');
      return;
    }
    if (message.type === 'ready') {
      setViewerReady(true);
      setLastMessage('Viewer ready. Tap the scene to send a message back.');
    } else if (message.type === 'route:stepChanged') {
      setLastMessage(`Viewer: route:stepChanged (step ${message.stepIndex + 1})`);
    } else {
      setLastMessage(`Viewer error: ${message.message}`);
    }
  }

  function moveCamera() {
    webView.current?.injectJavaScript(
      "window.ksugo.receive({type:'route:goto',stepIndex:1}); true;",
    );
    setLastMessage('App sent route:goto (step 2).');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>KSU GO · APP-1 SPIKE</Text>
          <Text style={styles.title}>Hallway viewer</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!viewerReady}
          onPress={moveCamera}
          style={[styles.button, !viewerReady && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Move camera</Text>
        </Pressable>
      </View>
      <View style={styles.viewer}>
        <WebView<object>
          ref={webView}
          source={{ html: corridorHtml }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled={false}
          scrollEnabled={false}
          bounces={false}
          onMessage={handleMessage}
          onError={(event) => setLastMessage(`WebView error: ${event.nativeEvent.description}`)}
          style={styles.webView}
        />
      </View>
      <View accessibilityLiveRegion="polite" style={styles.messageArea}>
        <Text style={styles.messageLabel}>APP ↔ VIEWER</Text>
        <Text style={styles.messageText}>{lastMessage}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111820' },
  header: { minHeight: 88, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flexShrink: 1 },
  eyebrow: { color: '#f0b849', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#f5f7f8', fontSize: 22, fontWeight: '700', marginTop: 3 },
  button: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 9, backgroundColor: '#f0b849' },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { color: '#17212a', fontSize: 13, fontWeight: '700' },
  viewer: { flex: 1, marginHorizontal: 10, marginBottom: 10, overflow: 'hidden', borderRadius: 12, backgroundColor: '#101820' },
  webView: { flex: 1, backgroundColor: '#101820' },
  messageArea: { minHeight: 70, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  messageLabel: { color: '#8997a3', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  messageText: { color: '#f5f7f8', fontSize: 13, marginTop: 5 },
});
