import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Text from "../../components/Text";
import { useFeedback } from "../../states/feedback";
import { useTheme } from "../../states/theme";
import {
  useGenericPersistentState,
  useGenericTempState,
} from "../../states/genericStates";
import { sc } from "../../utils/sizeScaler";
import FiltersModal from "../FilterModal";
import BottomBar from "./BottomBar";
import ServerInfo from "./ServerInfo";
import SearchBar from "./ServerList/SearchBar";
import Favorites from "./ServerList/Tabs/Favorites";
import Internet from "./ServerList/Tabs/Internet";
import Partners from "./ServerList/Tabs/Partners";
import RecentlyJoined from "./ServerList/Tabs/RecentlyJoined";

const MainView = memo(() => {
  const { filterMenu, setSearchData } = useGenericTempState();
  const { sideLists } = useGenericPersistentState();
  const { theme } = useTheme();
  const { listType } = useGenericTempState();

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchData("query", query);
    },
    [setSearchData]
  );

  const currentList = useMemo(() => {
    switch (listType) {
      case "favorites":
        return <Favorites />;
      case "partners":
        return <Partners />;
      case "internet":
        return <Internet />;
      case "recentlyjoined":
        return <RecentlyJoined />;
      default:
        return <Internet />;
    }
  }, [listType]);

  return (
    <View style={styles.body}>
      <FeedbackBanner />
      <SearchBar onChange={handleSearchChange} />
      <View style={styles.serverSection}>
        {currentList}
        {sideLists && <ServerInfo />}
      </View>
      <View style={[styles.bottomDivider, { backgroundColor: `${theme.textPrimary}1F` }]} />
      <BottomBar />
      {filterMenu && <FiltersModal />}
    </View>
  );
});

// Rounded-rectangle prompt shown at the top of the list while a feedback
// campaign is active. Clicking "Provide Feedback" opens the paged popup.
// Renders nothing when there's no active campaign.
const FeedbackBanner = memo(() => {
  const { theme } = useTheme();
  const hasCampaign = useFeedback((s) => !!s.campaign);
  const openPopup = useFeedback((s) => s.openPopup);

  if (!hasCampaign) return null;

  return (
    <View
      style={[
        bannerStyles.banner,
        {
          backgroundColor: theme.itemBackgroundColor,
          borderColor: `${theme.primary}55`,
        },
      ]}
    >
      <View style={bannerStyles.textWrap}>
        <Text size={2} semibold color={theme.textPrimary}>
          We're asking a small number of people about their experience
        </Text>
        <Text size={1} color={`${theme.textPrimary}99`} style={bannerStyles.sub}>
          It takes less than a minute and helps shape the launcher.
        </Text>
      </View>
      <Pressable
        onPress={openPopup}
        style={({ pressed, hovered }: any) => [
          bannerStyles.button,
          {
            backgroundColor: theme.primary,
            opacity: pressed ? 0.8 : hovered ? 0.92 : 1,
          },
        ]}
      >
        <Text size={2} semibold color="#FFFFFF">
          💬 Provide Feedback
        </Text>
      </Pressable>
    </View>
  );
});

FeedbackBanner.displayName = "FeedbackBanner";

const bannerStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sc(12),
    borderRadius: sc(10),
    borderWidth: 1,
    paddingVertical: sc(10),
    paddingHorizontal: sc(14),
    marginBottom: sc(10),
  },
  textWrap: {
    flex: 1,
    flexShrink: 1,
  },
  sub: {
    marginTop: sc(2),
  },
  button: {
    height: sc(34),
    borderRadius: sc(8),
    paddingHorizontal: sc(16),
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "pointer",
  },
});

const styles = StyleSheet.create({
  body: {
    flex: 1,
    width: "100%",
  },
  serverSection: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
  },
  bottomDivider: {
    height: 1,
    width: "100%",
  },
});

export default MainView;
