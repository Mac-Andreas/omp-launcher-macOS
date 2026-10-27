import { shell } from "@tauri-apps/api";
import { useMemo } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useServers } from "../../../states/servers";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
import { validateWebUrl } from "../../../utils/validation";
import AdditionalInfo from "./AdditionalInfo";
import PlayerList from "./PlayerList";

const ServerInfo = () => {
  const { theme, themeType } = useTheme();
  const { selected } = useServers();

  const webUrl = useMemo(() => {
    if (selected) {
      if (validateWebUrl(selected.rules.weburl)) {
        return selected.rules.weburl;
      }
    }
    return "";
  }, [selected]);

  const bannerUrl = useMemo(() => {
    if (!selected?.omp) return "";

    const { bannerDark, bannerLight } = selected.omp;
    const preferredBanner = themeType === "dark" ? bannerDark : bannerLight;
    const fallbackBanner = themeType === "dark" ? bannerLight : bannerDark;

    return preferredBanner || fallbackBanner || "";
  }, [selected?.omp?.bannerDark, selected?.omp?.bannerLight, themeType]);

  return (
    <View style={styles.serverInfoView}>
      {/* Server banner, when the server has one, in its own bordered box
          above the player list (clicking it opens the website). The website
          itself is also a link in the rules list (weburl). */}
      {bannerUrl.length ? (
        <View
          style={[
            styles.bannerBox,
            {
              backgroundColor: theme.itemBackgroundColor,
              borderColor: `${theme.textPrimary}1F`,
            },
          ]}
        >
          <div title={webUrl} style={{ width: "100%", height: "100%" }}>
            <Pressable
              disabled={webUrl.length < 1}
              style={styles.bannerPress}
              onPress={() =>
                shell.open(
                  webUrl.includes("http") ? webUrl : "https://" + webUrl
                )
              }
            >
              <Image
                source={{ uri: bannerUrl }}
                style={styles.bannerImage}
                resizeMode="contain"
              />
            </Pressable>
          </div>
        </View>
      ) : null}
      <PlayerList players={selected ? selected.players : []} />
      <AdditionalInfo server={selected} />
    </View>
  );
};

const styles = StyleSheet.create({
  serverInfoView: {
    flex: 0.3,
    height: "100%",
    marginLeft: sc(15),
  },
  bannerBox: {
    width: "100%",
    height: "11.5%",
    marginTop: sc(5),
    borderWidth: 1,
    borderRadius: sc(6),
    overflow: "hidden",
  },
  bannerPress: {
    width: "100%",
    height: "100%",
  },
  bannerImage: {
    position: "absolute",
    top: sc(6),
    left: sc(6),
    right: sc(6),
    bottom: sc(6),
  },
});

export default ServerInfo;
