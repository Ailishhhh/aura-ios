// Google's own sign-in page in a sheet, as on Android (auth/GoogleSignInSheet.kt). When Google
// sends you back to YouTube Music signed in, Aura takes the session from the page's cookies.

import { router } from "expo-router";
import { ComponentType, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Aura from "../modules/aura-native";
import { space, theme, type } from "../src/theme";
import { Icon, Tap, haptic } from "../src/ui/primitives";
import { completeSignIn } from "../src/yt/account";
import { isSignedInCookie } from "../src/yt/session";

const SIGN_IN_URL = "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F";
const MUSIC = "https://music.youtube.com";
// Google refuses sign-in in pages that announce an embedded web view; Safari's own agent is fine.
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const READ_CONFIG = `(function(){try{var c=(window.yt&&window.yt.config_)||{};window.ReactNativeWebView.postMessage(JSON.stringify({type:"config",visitorData:c.VISITOR_DATA||null,dataSyncId:c.DATASYNC_ID||null}));}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:"config"}));}})();true;`;

// react-native-webview's class types resolve to `never` props under React 19.3's types.
const Web = WebView as unknown as ComponentType<Record<string, unknown> & { ref?: unknown }>;

type Phase = "browsing" | "connecting" | "failed";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const web = useRef<{ injectJavaScript: (js: string) => void; reload: () => void } | null>(null);
  const [phase, setPhase] = useState<Phase>("browsing");
  const [host, setHost] = useState("accounts.google.com");
  const [error, setError] = useState<string | null>(null);
  const captured = useRef(false);

  const capture = async (config: { visitorData?: string | null; dataSyncId?: string | null }) => {
    if (captured.current) return;
    const cookie = await Aura.getCookies(MUSIC);
    if (!isSignedInCookie(cookie)) {
      setPhase("failed");
      setError("Google didn't finish signing you in. Try again.");
      return;
    }
    captured.current = true;
    setPhase("connecting");
    try {
      await completeSignIn({ cookie, visitorData: config.visitorData ?? null, dataSyncId: config.dataSyncId?.split("||")[0] ?? null });
      haptic.success();
      router.back();
    } catch (e) {
      captured.current = false;
      setPhase("failed");
      setError(String((e as Error).message ?? e));
    }
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Icon name="lock.fill" size={12} color={theme.muted} />
        <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
          {host}
        </Text>
        <Tap onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Icon name="xmark" size={16} color={theme.cream} />
        </Tap>
      </View>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <Web
          ref={web}
          source={{ uri: SIGN_IN_URL }}
          userAgent={SAFARI}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          style={{ flex: 1 }}
          onNavigationStateChange={(nav: { url: string; loading: boolean }) => {
            const match = /^https?:\/\/([^/]+)/.exec(nav.url);
            if (match) setHost(match[1]);
            if (nav.url.startsWith(MUSIC) && !nav.loading && phase !== "connecting") {
              setPhase("connecting");
              web.current?.injectJavaScript(READ_CONFIG);
            }
          }}
          onMessage={(event: { nativeEvent: { data: string } }) => {
            try {
              const message = JSON.parse(event.nativeEvent.data);
              if (message.type === "config") void capture(message);
            } catch {
              // Not ours.
            }
          }}
        />
        {phase !== "browsing" ? (
          <View style={styles.cover}>
            {phase === "connecting" ? (
              <>
                <ActivityIndicator color={theme.cream} />
                <Text style={[type.section, { marginTop: space.l }]}>Bringing your library</Text>
              </>
            ) : (
              <>
                <Text style={[type.section, { textAlign: "center" }]}>That didn't work</Text>
                <Text style={[type.caption, { textAlign: "center", marginTop: 8 }]}>{error}</Text>
                <Tap
                  onPress={() => {
                    setPhase("browsing");
                    setError(null);
                    web.current?.injectJavaScript(`window.location.href=${JSON.stringify(SIGN_IN_URL)};true;`);
                  }}
                  style={styles.retry}
                >
                  <Text style={[type.button, { color: theme.night }]}>Try again</Text>
                </Tap>
              </>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space.page, paddingVertical: 14 },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: theme.ink, alignItems: "center", justifyContent: "center", padding: space.xxl },
  retry: { marginTop: space.xl, paddingHorizontal: 22, height: 44, borderRadius: 22, backgroundColor: theme.cream, justifyContent: "center" },
});
