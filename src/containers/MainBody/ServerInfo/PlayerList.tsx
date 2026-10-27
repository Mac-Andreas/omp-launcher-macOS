import { t } from "i18next";
import { useMemo } from "react";
import { FlatList, ListRenderItemInfo, StyleSheet, View } from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import { images } from "../../../constants/images";
import { useServers } from "../../../states/servers";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
import { Player } from "../../../utils/types";

interface IProps {
  players: Player[];
}

const PlayerList = (props: IProps) => {
  const { theme, themeType } = useTheme();
  const { selected } = useServers();

  const bannerUrl = useMemo(() => {
    if (selected) {
      if (selected.omp) {
        const dark = selected.omp.bannerDark;
        const light = selected.omp.bannerLight;
        if (themeType === "dark") {
          if (dark) {
            return dark;
          } else {
            if (light) {
              return light;
            } else {
              return "";
            }
          }
        } else {
          if (light) {
            return light;
          } else {
            if (dark) {
              return dark;
            } else {
              return "";
            }
          }
        }
      }
    }
    return "";
  }, [selected?.omp, themeType]);

  const renderPlayer = ({
    item: player,
    index,
  }: ListRenderItemInfo<Player>) => {
    return (
      <View
        style={[styles.playerContainer, { marginBottom: sc(10) }]}
        key={"player-list-item-" + index}
      >
        <View style={[styles.commonFieldContainer, styles.nameFieldContainer]}>
          <Text style={{ fontSize: sc(16) }} color={theme.textPrimary}>
            {player.name}
          </Text>
        </View>
        <View
          style={[
            styles.commonFieldContainer,
            styles.scoreFieldContainer,
            { paddingHorizontal: sc(7) },
          ]}
        >
          <Text style={{ fontSize: sc(14) }} color={theme.textSecondary}>
            {player.score}
          </Text>
        </View>
      </View>
    );
  };

  const borderColor = `${theme.textPrimary}1F`;

  // GitHub-style table: one bordered box with the header as its own row.
  return (
    <View
      style={[
        styles.table,
        {
          backgroundColor: theme.itemBackgroundColor,
          borderColor,
          height: bannerUrl.length ? "51%" : "56%",
        },
      ]}
    >
      <View
        style={[
          styles.tableHeader,
          {
            borderBottomColor: borderColor,
            backgroundColor: `${theme.textPrimary}08`,
          },
        ]}
      >
        <View style={[styles.commonFieldContainer, styles.nameFieldContainer]}>
          <View style={styles.headerLabel}>
            <Icon
              svg
              image={images.icons.nickname}
              size={sc(14)}
              color={theme.textSecondary}
            />
            <Text
              semibold
              style={{ fontSize: sc(17) }}
              color={theme.textSecondary}
            >
              {t("player")}
            </Text>
          </View>
        </View>
        <View style={[styles.commonFieldContainer, styles.scoreFieldContainer]}>
          <View style={styles.headerLabel}>
            <Icon
              svg
              image={images.icons.score}
              size={sc(14)}
              color={theme.textSecondary}
            />
            <Text
              semibold
              style={{ fontSize: sc(17) }}
              color={theme.textSecondary}
            >
              {t("score")}
            </Text>
          </View>
        </View>
      </View>
      <FlatList
        id={themeType === "dark" ? "scroll" : "scroll-light"}
        style={styles.tableBody}
        // The scrollbar overlays the content (main.css), so the right padding
        // keeps it off the score boxes.
        contentContainerStyle={styles.tableBodyContent}
        data={props.players}
        renderItem={renderPlayer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  table: {
    marginTop: sc(5),
    borderWidth: 1,
    borderRadius: sc(6),
    overflow: "hidden",
  },
  tableHeader: {
    height: sc(34),
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: sc(15),
    paddingRight: sc(16),
    borderBottomWidth: 1,
  },
  headerLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
  },
  tableBody: {
    flex: 1,
  },
  tableBodyContent: {
    paddingTop: sc(12),
    paddingBottom: sc(2),
    paddingLeft: sc(15),
    paddingRight: sc(15),
  },
  playerContainer: {
    height: sc(20),
    flexDirection: "row",
  },
  commonFieldContainer: {
    justifyContent: "center",
  },
  nameFieldContainer: {
    flex: 1,
    alignItems: "flex-start",
  },
  scoreFieldContainer: {
    paddingRight: 5,
    alignItems: "flex-end",
  },
});

export default PlayerList;
