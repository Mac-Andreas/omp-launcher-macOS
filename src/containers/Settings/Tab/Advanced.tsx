import { invoke } from "@tauri-apps/api";
import { t } from "i18next";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import { IN_GAME } from "../../../constants/app";
import { images } from "../../../constants/images";
import { usePersistentServers } from "../../../states/servers";
import { useSettings } from "../../../states/settings";
import { useTheme } from "../../../states/theme";
import {
  checkDirectoryValidity,
  exportFavoriteListFile,
  importFavoriteListFile,
} from "../../../utils/game";
import { Log } from "../../../utils/logger";
import { sc } from "../../../utils/sizeScaler";
import { Server } from "../../../utils/types";

const IMPORT_GREEN = "#3FB950";
const EXPORT_ORANGE = "#E08A33";

// Big action card used for the two favorites tiles (Import / Export). Coloured
// border + filled icon chip make the destructive vs additive intent obvious at
// a glance.
const ActionCard = ({
  icon,
  title,
  description,
  color,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  color: string;
  onPress: () => void;
}) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.actionCard,
        {
          backgroundColor: hovered
            ? `${color}1A`
            : theme.itemBackgroundColor,
          borderColor: `${color}AA`,
        },
      ]}
    >
      <View
        style={[
          styles.actionIcon,
          { backgroundColor: `${color}26`, borderColor: `${color}66` },
        ]}
      >
        <Icon image={icon} size={sc(20)} color={color} />
      </View>
      <Text semibold size={2} color={theme.textPrimary} style={styles.actionTitle}>
        {title}
      </Text>
      <Text
        size={1}
        color={`${theme.textPrimary}AA`}
        style={styles.actionDesc}
        numberOfLines={0}
      >
        {description}
      </Text>
    </Pressable>
  );
};

const Advanced = () => {
  const { theme } = useTheme();
  const {
    customGameExe,
    setCustomGameExe,
    bottleName,
    setGTASAPath,
    setNickName,
  } = useSettings();

  const importNicknameAndPath = async () => {
    try {
      const gtaPath: string = await invoke("get_gtasa_path_for_bottle", {
        bottleName,
      });
      if (gtaPath.length) {
        const newPath = gtaPath.replace(/\\/g, "/");
        if (await checkDirectoryValidity(newPath)) setGTASAPath(newPath);
      }
      const name: string = await invoke("get_nickname_from_samp");
      if (name.length) setNickName(name);
    } catch (e) {
      Log.debug(e);
    }
  };

  const importFavoritesFromSamp = async () => {
    await invoke("get_samp_favorite_list").then((a) => {
      const data: {
        file_id: string;
        favorite_servers: {
          ip: string;
          port: number;
          name: string;
          password: string;
        }[];
      } = JSON.parse(a as string);
      if (data.file_id !== "SAMP") return;
      const { addToFavorites } = usePersistentServers.getState();
      data.favorite_servers.forEach((s) => {
        if (!s.ip.length) return;
        const info: Server = {
          ip: s.ip,
          port: s.port,
          hostname: s.name.includes("(Retrieving info...)")
            ? `No information (${s.ip}:${s.port})`
            : s.name,
          playerCount: 0,
          maxPlayers: 0,
          gameMode: "-",
          language: "-",
          hasPassword: false,
          version: "-",
          usingOmp: false,
          partner: false,
          ping: 0,
          password: s.password,
          players: [],
          rules: {} as Server["rules"],
        };
        addToFavorites(info);
      });
    });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {!IN_GAME && (
        <>
          <Text semibold size={2} color={theme.textPrimary}>
            {t("settings_custom_game_exe_label")}
          </Text>
          <Text
            size={1}
            color={`${theme.textPrimary}88`}
            style={styles.sectionSub}
            numberOfLines={0}
          >
            {t("settings_custom_game_exe_subtitle", {
              defaultValue:
                "Override the auto-detected gta-sa.exe. Leave blank to use the CrossOver bottle's copy.",
            })}
          </Text>
          <TextInput
            value={customGameExe}
            onChangeText={setCustomGameExe}
            placeholder="/Users/.../Grand Theft Auto San Andreas/gta-sa.exe"
            placeholderTextColor={`${theme.textPrimary}66`}
            // @ts-ignore
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                backgroundColor: theme.textInputBackgroundColor,
                borderColor: `${theme.textPrimary}1F`,
              },
            ]}
          />
          <View
            style={[
              styles.divider,
              { backgroundColor: `${theme.textPrimary}14` },
            ]}
          />
        </>
      )}

      <Text semibold size={2} color={theme.textPrimary}>
        {t("settings_tile_import_combined_title", {
          defaultValue: "Import & backup",
        })}
      </Text>
      <Text
        size={1}
        color={`${theme.textPrimary}88`}
        style={styles.sectionSub}
        numberOfLines={0}
      >
        {t("settings_tile_import_combined_subtitle", {
          defaultValue:
            "Back up / restore the launcher's favorites, or import existing SA-MP nickname, path and favorites.",
        })}
      </Text>
      <View style={styles.cardRow}>
        <ActionCard
          icon={images.icons.favAdd}
          title={t("settings_import_favorite_list_file", {
            defaultValue: "Import favorites",
          })}
          description={t("settings_import_favorite_desc_short", {
            defaultValue: "Load a previously exported favorites file.",
          })}
          color={IMPORT_GREEN}
          onPress={importFavoriteListFile}
        />
        <ActionCard
          icon={images.icons.copy}
          title={t("settings_export_favorite_list_file", {
            defaultValue: "Export favorites",
          })}
          description={t("settings_export_favorite_desc_short", {
            defaultValue: "Save the favorites list to a file.",
          })}
          color={EXPORT_ORANGE}
          onPress={exportFavoriteListFile}
        />
        <View
          style={[
            styles.cardDivider,
            { backgroundColor: `${theme.textPrimary}1F` },
          ]}
        />
        <ActionCard
          icon={images.icons.nickname}
          title={t("settings_import_nickname_short", {
            defaultValue: "Import nickname & path",
          })}
          description={t("settings_import_nickname_desc_short", {
            defaultValue:
              "From SA-MP %APPDATA% in the bottle.",
          })}
          color={IMPORT_GREEN}
          onPress={importNicknameAndPath}
        />
        <ActionCard
          icon={images.icons.favAdd}
          title={t("settings_import_samp_favorite_short", {
            defaultValue: "Import SA-MP favorites",
          })}
          description={t("settings_import_samp_favorite_desc_short", {
            defaultValue: "From SA-MP's USERDATA.DAT.",
          })}
          color={IMPORT_GREEN}
          onPress={importFavoritesFromSamp}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: sc(14),
    paddingVertical: sc(12),
    gap: sc(8),
  },
  sectionSub: {
    lineHeight: sc(16),
  },
  input: {
    height: sc(38),
    borderRadius: sc(6),
    borderWidth: 1,
    paddingHorizontal: sc(10),
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(15),
    // @ts-ignore
    outlineStyle: "none",
  },
  divider: {
    height: 1,
    marginVertical: sc(6),
  },
  cardRow: {
    flexDirection: "row",
    gap: sc(8),
    alignItems: "stretch",
  },
  cardDivider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: sc(2),
  },
  actionCard: {
    flex: 1,
    flexBasis: 0,
    padding: sc(10),
    borderRadius: sc(10),
    borderWidth: 1,
    gap: sc(6),
    // @ts-ignore
    cursor: "pointer",
  },
  actionIcon: {
    width: sc(30),
    height: sc(30),
    borderRadius: sc(7),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: sc(13),
    lineHeight: sc(16),
  },
  actionDesc: {
    fontSize: sc(11),
    lineHeight: sc(14),
  },
});

export default Advanced;
