// Settings, as on Android: how covers are printed, how songs play, and moving your library between
// this iPhone and the web player.

import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { ReactNode } from "react";
import { Alert, Image as RNImage, Linking, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { DitherStyle, Grain, Settings, exportLibrary, importLibrary, setSetting, settings, useValue } from "../src/lib/store";
import { radius, space, theme, type } from "../src/theme";
import { Artwork } from "../src/ui/Artwork";
import { Icon, Tap, haptic } from "../src/ui/primitives";

const PREVIEW = RNImage.resolveAssetSource(require("../assets/img/cover.jpg")).uri;

export default function SettingsScreen() {
  const s = useValue(settings);

  const exportFile = async () => {
    try {
      const file = new File(Paths.cache, `aura-library-${new Date().toISOString().slice(0, 10)}.json`);
      file.write(JSON.stringify(exportLibrary()));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Save your Aura library", UTI: "public.json" });
    } catch (e) {
      Alert.alert("Couldn't export", String((e as Error).message ?? e));
    }
  };

  const importFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "public.json"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      const data = await new File(picked.assets[0].uri).json();
      importLibrary(data);
      haptic.success();
      Alert.alert("Library imported", "Your likes, playlists and history are here now.");
    } catch (e) {
      Alert.alert("Couldn't import", String((e as Error).message ?? e));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.ink }} contentContainerStyle={{ padding: space.page, paddingBottom: 60 }}>
      <View style={styles.top}>
        <Text style={type.title}>Settings</Text>
        <Tap onPress={() => router.back()} hitSlop={12} accessibilityLabel="Done">
          <Text style={[type.button, { color: theme.cream }]}>Done</Text>
        </Tap>
      </View>

      <View style={styles.preview}>
        <Artwork uri={PREVIEW} size={96} radius={radius.m} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.itemTitle}>How covers look</Text>
          <Text style={type.caption}>Every cover is printed, like the Android app. Changes show here as you make them.</Text>
        </View>
      </View>

      <Group title="Artwork">
        <ToggleRow label="Dither artwork" detail="Print covers in a few tones of ink" value={s.dither} onChange={(v) => setSetting("dither", v)} />
        {s.dither ? (
          <>
            <Choice<DitherStyle> label="Style" value={s.style} options={[["noise", "Noise"], ["bayer", "Bayer"], ["halftone", "Halftone"], ["lines", "Lines"]]} onChange={(v) => setSetting("style", v)} />
            <Choice<Grain> label="Grain" value={s.grain} options={[["fine", "Fine"], ["medium", "Medium"], ["coarse", "Coarse"]]} onChange={(v) => setSetting("grain", v)} />
          </>
        ) : (
          <ToggleRow label="Original colours" detail="Show covers as the artist made them" value={s.originalColors} onChange={(v) => setSetting("originalColors", v)} />
        )}
      </Group>

      <Group title="Playback">
        <ToggleRow label="Even out volume" detail="Turn loud masters down to match the rest" value={s.evenVolume} onChange={(v) => setSetting("evenVolume", v)} />
        <Choice<Settings["quality"]> label="Sound" value={s.quality} options={[["high", "Best"], ["low", "Data saver"]]} onChange={(v) => setSetting("quality", v)} />
        <ToggleRow label="Haptics" detail="Small taps under your finger" value={s.haptics} onChange={(v) => setSetting("haptics", v)} />
      </Group>

      <Group title="Your library">
        <ActionRow icon="square.and.arrow.up" label="Export library" detail="Save likes, playlists and history as a file" onPress={exportFile} />
        <ActionRow icon="square.and.arrow.down" label="Import library" detail="From the web player or another iPhone" onPress={importFile} />
      </Group>

      <Group title="Links">
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.row}>Opening YouTube Music links</Text>
            <Text style={type.caption}>
              Paste a link into Search, or share it to Aura. Links that start with aura:// open here straight away, e.g. aura://open?url=… from Shortcuts or tryaura.today.
            </Text>
          </View>
        </View>
      </Group>

      <Group title="About">
        <ActionRow icon="chevron.left.forwardslash.chevron.right" label="Source code" detail="GPL-3.0, like Aura for Android" onPress={() => void Linking.openURL("https://github.com/Ailishhhh/aura-ios")} />
        <ActionRow icon="globe" label="tryaura.today" onPress={() => void Linking.openURL("https://tryaura.today")} />
      </Group>

      <Text style={[type.eyebrow, { textAlign: "center", marginTop: space.xl }]}>Aura · {Constants.expoConfig?.version ?? ""}</Text>
      <Text style={[type.fine, { textAlign: "center", marginTop: 6 }]}>Lyrics from lrc.red and YouTube Music, drawn by am-lyrics.</Text>
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.xxl }}>
      <Text style={[type.eyebrow, { marginBottom: space.s, marginLeft: 4 }]}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.row}>{label}</Text>
        {detail ? <Text style={type.caption}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.tap();
          onChange(v);
        }}
        trackColor={{ true: theme.cream, false: theme.lifted }}
        thumbColor={value ? theme.night : theme.muted}
        ios_backgroundColor={theme.lifted}
      />
    </View>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={[styles.row, { flexDirection: "column", alignItems: "stretch", gap: 10 }]}>
      <Text style={type.row}>{label}</Text>
      <View style={styles.segments}>
        {options.map(([key, name]) => (
          <Tap key={key} onPress={() => onChange(key)} style={[styles.segment, value === key && styles.segmentOn]} scale={0.95}>
            <Text style={[type.caption, { fontWeight: "600", color: value === key ? theme.night : theme.cream }]}>{name}</Text>
          </Tap>
        ))}
      </View>
    </View>
  );
}

function ActionRow({ icon, label, detail, onPress }: { icon: any; label: string; detail?: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={styles.row} scale={0.99}>
      <Icon name={icon} size={18} color={theme.cream} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.row}>{label}</Text>
        {detail ? <Text style={type.caption}>{detail}</Text> : null}
      </View>
      <Icon name="chevron.right" size={12} color={theme.faint} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.s },
  preview: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: space.xl, padding: space.l, borderRadius: radius.l, backgroundColor: theme.raised },
  group: { borderRadius: radius.l, backgroundColor: theme.raised, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: space.l, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
  segments: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: theme.lifted },
  segmentOn: { backgroundColor: theme.cream },
});
