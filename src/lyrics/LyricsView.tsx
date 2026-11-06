// The Android app's lyrics page (am-lyrics in a WebView), fed the player's clock ~12 times a second.
// The page keeps its own forward-only clock between pushes, so word wipes never stutter.

import { useEffect, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

import { queue } from "../player/queue";
import { LYRICS_PAGE } from "./page.generated";

export function LyricsView({ ttml, style }: { ttml: string; style?: StyleProp<ViewStyle> }) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const shown = useRef<string | null>(null);

  const send = () => {
    if (!ready.current || !web.current) return;
    if (shown.current !== ttml) {
      shown.current = ttml;
      web.current.injectJavaScript(`window.setTrack(${JSON.stringify(ttml)}); true;`);
    }
  };

  useEffect(send, [ttml]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!ready.current || !web.current) return;
      const { player } = queue.snapshot();
      const playing = player.state === "playing";
      web.current.injectJavaScript(`window.sync && window.sync(${Math.round(player.position * 1000)}, ${playing}, 1); true;`);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={style}>
      <WebView
        ref={web}
        originWhitelist={["*"]}
        source={{ html: LYRICS_PAGE, baseUrl: "https://tryaura.today/" }}
        style={{ flex: 1, backgroundColor: "transparent" }}
        containerStyle={{ backgroundColor: "transparent" }}
        opaque={false}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        allowsInlineMediaPlayback={false}
        javaScriptEnabled
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === "ready") {
              ready.current = true;
              shown.current = null;
              send();
            } else if (message.type === "seek" && typeof message.ms === "number") {
              void queue.seek(message.ms / 1000);
            }
          } catch {
            // Not ours.
          }
        }}
      />
    </View>
  );
}
