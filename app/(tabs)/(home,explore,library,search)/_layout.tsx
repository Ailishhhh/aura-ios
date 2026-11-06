// One stack layout for every tab, so albums, playlists and artists open inside whichever tab you're
// in. Pushed pages draw their own hero; the header is only a glass back button over it.

import { Stack } from "expo-router";

import { serif, theme } from "../../../src/theme";

export const unstable_settings = {
  anchor: "index",
  explore: { anchor: "explore" },
  library: { anchor: "library" },
  search: { anchor: "search" },
};

export default function TabStack({ segment }: { segment: string }) {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerTitle: "",
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: theme.cream,
        contentStyle: { backgroundColor: theme.night },
      }}
    >
      {segment === "(home)" ? <Stack.Screen name="index" options={{ headerShown: false }} /> : null}
      {segment === "(explore)" ? <Stack.Screen name="explore" options={{ headerShown: false }} /> : null}
      {segment === "(library)" ? <Stack.Screen name="library" options={{ headerShown: false }} /> : null}
      {segment === "(search)" ? (
        <Stack.Screen
          name="search"
          options={{
            headerTitle: "Search",
            headerLargeTitle: true,
            headerLargeTitleStyle: { fontFamily: serif, color: theme.cream },
            headerTitleStyle: { fontFamily: serif, color: theme.cream },
            headerLargeTitleShadowVisible: false,
            headerBlurEffect: "systemChromeMaterialDark",
          }}
        />
      ) : null}
    </Stack>
  );
}
