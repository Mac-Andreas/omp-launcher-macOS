import { t } from "i18next";
import { useMemo } from "react";
import { shell } from "@tauri-apps/api";
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import { images } from "../../../constants/images";
import { usePersistentServers } from "../../../states/servers";
import { useSettings } from "../../../states/settings";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
import { Server } from "../../../utils/types";
import { validateWebUrl } from "../../../utils/validation";

interface IProps {
  server: Server | undefined;
}

type Rule = { name: string; value: string };
type RuleList = Rule[];

const AdditionalInfo = (props: IProps) => {
  const { theme, themeType } = useTheme();

  const rules = useMemo(() => {
    if (props.server) {
      return Object.entries(props.server.rules).map((data) => {
        return {
          name: data[0],
          value: data[1],
        };
      });
    } else {
      return [] as RuleList;
    }
  }, [props.server?.rules]);

  // Values are plain text; the box only adds the padding the header's right
  // edge lines up with, plus a tint for on/off style values (see toneFor).
  const valueBoxStyle = {
    height: sc(26),
    paddingHorizontal: sc(7),
    borderRadius: sc(5),
  };

  const green = themeType === "dark" ? "#3FB950" : "#1F883D";
  const red = themeType === "dark" ? "#F85149" : "#CF222E";

  // Yes/No and On/Off style values (artwork, lagcomp, ...) get a dark green /
  // red tint so their state reads at a glance.
  const toneFor = (value: string) => {
    if (/^(yes|on|true|enabled)$/i.test(value.trim())) return green;
    if (/^(no|off|false|disabled)$/i.test(value.trim())) return red;
    return undefined;
  };

  // The SA-MP client this server would be joined with: its per-server choice,
  // else the global one. "custom" is an unknown version, so it matches nothing.
  const { sampVersion } = useSettings();
  const { getServerSettings, perServerSettings } = usePersistentServers();
  const clientFamily = useMemo(() => {
    const version =
      (props.server && getServerSettings(props.server)?.sampVersion) ||
      sampVersion;
    if (version === "03DL_samp.dll") return "dl";
    if (version.startsWith("037")) return "037";
    return undefined;
  }, [props.server, perServerSettings, sampVersion]);

  const tokenFamily = (token: string) => {
    if (/dl/i.test(token)) return "dl";
    if (/0\.?3\.?7/.test(token)) return "037";
    return undefined;
  };

  const renderRule = ({ item: rule, index }: ListRenderItemInfo<Rule>) => {
    // allowed_clients can be a list ("0.3.7, 0.3.7DL"). Render one box per
    // client, each using the same box + text style as every other value.
    if (rule.name === "allowed_clients") {
      const tokens = rule.value
        .split(/[,/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const boxes = tokens.length ? tokens : [rule.value];
      // Green for the allowed client matching the user's version, grey for the
      // other allowed ones; all red when none of them match. With a "custom"
      // client the version is unknown, so every box stays grey.
      const supported = boxes.some(
        (token) => clientFamily && tokenFamily(token) === clientFamily
      );
      return (
        <View
          style={[
            styles.rulesContainer,
            styles.acRuleContainer,
            { marginBottom: sc(5) },
          ]}
          key={"rule-list-item-" + index}
        >
          <View style={[styles.ruleFieldContainer, styles.acRuleLabel]}>
            <Text style={{ fontSize: sc(16) }} color={theme.textPrimary}>
              {rule.name}
            </Text>
          </View>
          <View style={[styles.valueFieldContainer, styles.acValueContainer]}>
            {boxes.map((token, i) => {
              const tone = !clientFamily
                ? undefined
                : !supported
                ? red
                : tokenFamily(token) === clientFamily
                ? green
                : undefined;
              return (
                <View
                  key={"ac-" + i}
                  style={[
                    styles.commonFieldContainer,
                    valueBoxStyle,
                    styles.acBox,
                    tone
                      ? { backgroundColor: `${tone}26`, borderColor: `${tone}55` }
                      : { borderColor: `${theme.textPrimary}26` },
                  ]}
                >
                  <Text
                    style={{ fontSize: sc(14) }}
                    semibold={!!tone}
                    color={tone ?? theme.textSecondary}
                  >
                    {token}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      );
    }
    // weburl is the server's website: its value box is a link that opens it.
    if (rule.name === "weburl" && validateWebUrl(rule.value)) {
      const url = rule.value.includes("http")
        ? rule.value
        : "https://" + rule.value;
      return (
        <View
          style={[styles.rulesContainer, { marginBottom: sc(5) }]}
          key={"rule-list-item-" + index}
        >
          <View
            style={[styles.commonFieldContainer, styles.ruleFieldContainer]}
          >
            <Text style={{ fontSize: sc(16) }} color={theme.textPrimary}>
              {rule.name}
            </Text>
          </View>
          <Pressable
            onPress={() => shell.open(url)}
            style={[
              styles.commonFieldContainer,
              styles.valueFieldContainer,
              valueBoxStyle,
              styles.linkBox,
            ]}
          >
            <Text style={{ fontSize: sc(14) }} color={theme.primary}>
              {rule.value}
            </Text>
            <Icon
              svg
              image={images.icons.external}
              size={sc(10)}
              color={theme.primary}
            />
          </Pressable>
        </View>
      );
    }
    const tone = toneFor(rule.value);
    return (
      <View
        style={[styles.rulesContainer, { marginBottom: sc(5) }]}
        key={"rule-list-item-" + index}
      >
        <View style={[styles.commonFieldContainer, styles.ruleFieldContainer]}>
          <Text style={{ fontSize: sc(16) }} color={theme.textPrimary}>
            {rule.name}
          </Text>
        </View>
        <View
          style={[
            styles.commonFieldContainer,
            styles.valueFieldContainer,
            valueBoxStyle,
            tone && {
              backgroundColor: `${tone}26`,
              borderWidth: 1,
              borderColor: `${tone}55`,
            },
          ]}
        >
          <Text
            style={{ fontSize: sc(14) }}
            semibold={!!tone}
            color={tone ?? theme.textSecondary}
          >
            {rule.value}
          </Text>
        </View>
      </View>
    );
  };

  const borderColor = `${theme.textPrimary}1F`;

  // GitHub-style table, matching the player list above it.
  return (
    <View style={styles.additionalInfoView}>
      <View
        style={[
          styles.table,
          { backgroundColor: theme.itemBackgroundColor, borderColor },
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
          <View
            style={[styles.commonFieldContainer, styles.ruleFieldContainer]}
          >
            <View style={styles.headerLabel}>
              <Icon
                svg
                image={images.icons.rule}
                size={sc(14)}
                color={theme.textSecondary}
              />
              <Text
                semibold
                style={{ fontSize: sc(17) }}
                color={theme.textSecondary}
              >
                {t("rule")}
              </Text>
            </View>
          </View>
          <View
            style={[styles.commonFieldContainer, styles.valueFieldContainer]}
          >
            <View style={styles.headerLabel}>
              <Icon
                svg
                image={images.icons.value}
                size={sc(14)}
                color={theme.textSecondary}
              />
              <Text
                semibold
                style={{ fontSize: sc(17) }}
                color={theme.textSecondary}
              >
                {t("value")}
              </Text>
            </View>
          </View>
        </View>
        <FlatList
          id={themeType === "dark" ? "scroll" : "scroll-light"}
          style={styles.tableBody}
          // Right padding keeps the overlay scrollbar off the value boxes.
          contentContainerStyle={styles.tableBodyContent}
          data={rules}
          renderItem={renderRule}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  additionalInfoView: {
    width: "100%",
    flex: 1,
  },
  table: {
    flex: 1,
    marginTop: sc(6),
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
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(5),
    // @ts-ignore
    cursor: "pointer",
  },
  tableBody: {
    flex: 1,
  },
  tableBodyContent: {
    paddingVertical: sc(10),
    paddingLeft: sc(15),
    paddingRight: sc(15),
  },
  rulesContainer: {
    height: sc(26),
    flexDirection: "row",
  },
  commonFieldContainer: {
    justifyContent: "center",
    height: sc(26),
  },
  ruleFieldContainer: {
    flex: 1,
    alignItems: "flex-start",
  },
  valueFieldContainer: {
    paddingRight: 5,
    alignItems: "flex-end",
  },
  acRuleContainer: {
    height: "auto",
    minHeight: sc(26),
    alignItems: "center",
  },
  acRuleLabel: {
    justifyContent: "center",
  },
  acValueContainer: {
    flex: 1,
    height: "auto",
    // valueFieldContainer's 5px right padding would push these boxes in from
    // the edge the other rows' value boxes sit on.
    paddingRight: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: sc(6),
  },
  // Each client version is outlined (no fill) so the list reads as chips.
  acBox: {
    alignItems: "center",
    borderWidth: 1,
  },
});

export default AdditionalInfo;
