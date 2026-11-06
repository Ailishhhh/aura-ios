// Home, Explore, Library and Search, in the system's own tab bar: Liquid Glass on iOS 26, with
// the mini player in its accessory and search as its own round tab, like Apple Music.

import { NativeTabs } from "expo-router/unstable-native-tabs";
import { View } from "react-native";

import { FloatingMiniPlayer, MiniPlayerContent } from "../../src/player/MiniPlayer";
import { useQueueSelect } from "../../src/player/queue";
import { theme } from "../../src/theme";
import { liquidGlass } from "../../src/ui/primitives";

function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniPlayerContent inline={placement === "inline"} />;
}

export default function TabsLayout() {
  const hasSong = useQueueSelect((s) => s.current != null);
  return (
    <View style={{ flex: 1, backgroundColor: theme.night }}>
      <NativeTabs tintColor={theme.cream} iconColor={{ default: theme.muted, selected: theme.cream }} minimizeBehavior="onScrollDown" blurEffect="systemChromeMaterialDark">
        {liquidGlass && hasSong ? (
          <NativeTabs.BottomAccessory>
            <Accessory />
          </NativeTabs.BottomAccessory>
        ) : null}
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(explore)">
          <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(library)">
          <NativeTabs.Trigger.Icon sf={{ default: "square.stack", selected: "square.stack.fill" }} />
          <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(search)" role="search">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      {!liquidGlass ? <FloatingMiniPlayer /> : null}
    </View>
  );
}
