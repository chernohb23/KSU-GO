import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { parseViewerMessage, serializeAppMessage, type AppToViewerMessage, type ViewerToAppMessage } from './bridge';

export type ViewerWebViewHandle = {
  send(message: AppToViewerMessage): void;
  isReady(): boolean;
};

export type ViewerWebViewProps = {
  source: { html: string };
  initialMessage?: AppToViewerMessage;
  onMessage(message: ViewerToAppMessage): void;
  onReady?(): void;
  onError?(message: string): void;
};

export const ViewerWebView = forwardRef<ViewerWebViewHandle, ViewerWebViewProps>(function ViewerWebView(
  { source, initialMessage, onMessage, onReady, onError },
  forwardedRef,
) {
  const webView = useRef<WebView<object>>(null);
  const ready = useRef(false);
  const pending = useRef<AppToViewerMessage | null>(initialMessage ?? null);

  const send = useCallback((message: AppToViewerMessage) => {
    if (!ready.current) {
      pending.current = message;
      return;
    }
    webView.current?.injectJavaScript(serializeAppMessage(message));
  }, []);

  useImperativeHandle(forwardedRef, () => ({ send, isReady: () => ready.current }), [send]);

  useEffect(() => {
    if (initialMessage) send(initialMessage);
  }, [initialMessage, send]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseViewerMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'ready') {
      const wasReady = ready.current;
      ready.current = true;
      if (!wasReady) {
        const queued = pending.current;
        pending.current = null;
        if (queued) webView.current?.injectJavaScript(serializeAppMessage(queued));
        // Restore a screen's current step only after its queued scene is loaded.
        onReady?.();
      }
    }
    onMessage(message);
  };

  return (
    <WebView<object>
      ref={webView}
      source={source}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled={false}
      scrollEnabled={false}
      bounces={false}
      // The viewer is a touch surface: no text selection loupe, link previews or
      // detected links on long press. The page CSS also turns off selection.
      textInteractionEnabled={false}
      allowsLinkPreview={false}
      dataDetectorTypes={['none']}
      onMessage={handleMessage}
      onError={(event) => onError?.(event.nativeEvent.description)}
      onLoadStart={() => {
        ready.current = false;
        pending.current = initialMessage ?? pending.current;
      }}
      style={{ flex: 1, backgroundColor: '#101820' }}
    />
  );
});
