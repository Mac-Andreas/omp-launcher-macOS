import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next"; // ✅ use this instead
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import Icon from "../components/Icon";
import TabBar from "../components/TabBar";
import Text from "../components/Text";
import { images } from "../constants/images";
import { useGenericTempState } from "../states/genericStates";
import { useNicknameAlert } from "../states/nicknameAlert";
import { useSettings } from "../states/settings";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import { telemetryWindowFocus } from "../utils/telemetry";
import { ListType } from "../utils/types";

const NavBar = memo(() => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { nickName, setNickName, recentNicknames } = useSettings();
  const { setListType, listType } = useGenericTempState();
  const nicknameRequired = useNicknameAlert((s) => s.required);
  const clearNicknameAlert = useNicknameAlert((s) => s.clear);

  // Drop the alert as soon as the user puts something into the field. Also
  // self-clear after a few seconds so it doesn't linger forever if they walk
  // away without typing.
  useEffect(() => {
    if (nicknameRequired && nickName.trim().length > 0) clearNicknameAlert();
  }, [nicknameRequired, nickName, clearNicknameAlert]);
  useEffect(() => {
    if (!nicknameRequired) return;
    const id = setTimeout(clearNicknameAlert, 6000);
    return () => clearTimeout(id);
  }, [nicknameRequired, clearNicknameAlert]);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDropdown = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setDropdownOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setDropdownOpen(false), 150);
  }, []);

  const handleRecentNicknamePress = useCallback(
    (name: string) => {
      setNickName(name);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setDropdownOpen(false);
    },
    [setNickName]
  );

  const tabList = useMemo(
    () => [
      {
        icon: images.icons.favTab,
        label: t("favorites"),
        type: "favorites" as ListType,
      },
      {
        icon: images.icons.internet,
        label: t("internet"),
        type: "internet" as ListType,
      },
      {
        icon: images.icons.partner,
        label: t("partners"),
        type: "partners" as ListType,
      },
      {
        icon: images.icons.recently,
        label: t("recently_joined"),
        type: "recentlyjoined" as ListType,
      },
    ],
    [t, i18n.language]
  );

  const dynamicStyles = useMemo(
    () => ({
      nicknameBox: {
        height: sc(35),
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingLeft: sc(10),
        paddingRight: sc(8),
        gap: sc(8),
        borderRadius: sc(6),
        borderWidth: 1,
        borderColor: nicknameRequired ? "#E08A33" : `${theme.textPrimary}26`,
        backgroundColor: nicknameRequired
          ? "#E08A331A"
          : theme.itemBackgroundColor,
      },
      alertChip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: sc(6),
        height: sc(35),
        paddingHorizontal: sc(10),
        marginRight: sc(8),
        borderRadius: sc(6),
        borderWidth: 1,
        borderColor: "#E08A3399",
        backgroundColor: "#E08A331F",
      },
      nicknameInput: {
        fontFamily: "Proxima Nova Regular",
        backgroundColor: "transparent",
        color: theme.textPrimary,
        fontSize: sc(17),
        width: sc(160),
        height: "100%" as const,
        // @ts-ignore
        outlineStyle: "none",
      },
    }),
    [theme, nicknameRequired]
  );

  const handleTabChange = useCallback(
    (type: string) => {
      setListType(type as ListType);
      telemetryWindowFocus(type);
    },
    [setListType]
  );

  const handleNicknameChange = useCallback(
    (text: string) => setNickName(text),
    [setNickName]
  );

  return (
    <View style={styles.container}>
      <TabBar onChange={handleTabChange} list={tabList} selected={listType} />
      <View style={styles.inputs}>
        {nicknameRequired && (
          <View style={dynamicStyles.alertChip}>
            <Icon
              svg
              image={images.icons.warning}
              size={sc(13)}
              color="#E08A33"
            />
            <Text size={1} semibold color="#E08A33">
              {t("nickname_required_chip", {
                defaultValue: "Nickname required",
              })}
            </Text>
          </View>
        )}
        <View style={dynamicStyles.nicknameBox}>
          <Icon
            title={t("nickname")}
            image={images.icons.nickname}
            size={sc(16)}
            color={`${theme.textPrimary}99`}
          />
          <View style={styles.nicknameInputWrapper}>
            <TextInput
              value={nickName}
              onChangeText={handleNicknameChange}
              onFocus={openDropdown}
              onBlur={closeDropdown}
              placeholder={`${t("nickname")}...`}
              placeholderTextColor={theme.textSecondary}
              // @ts-ignore — RN-Web TextInput supports outlineStyle
              style={dynamicStyles.nicknameInput}
            />
            {dropdownOpen && recentNicknames.length > 0 && (
              <View
                style={[
                  styles.dropdown,
                  {
                    backgroundColor: theme.itemBackgroundColor,
                    borderColor: theme.textSecondary,
                  },
                ]}
              >
                {recentNicknames.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => handleRecentNicknamePress(name)}
                    style={styles.dropdownItem}
                  >
                    <RNText
                      numberOfLines={1}
                      style={[
                        styles.dropdownItemText,
                        { color: theme.textPrimary },
                      ]}
                    >
                      {name}
                    </RNText>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%", height: 30, flexDirection: "row", zIndex: 50 },
  iconsContainer: {
    height: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    flexDirection: "row",
  },
  iconContainer: {
    height: "80%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inputs: {
    height: "100%",
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  nicknameContainer: {
    height: sc(35),
    flexDirection: "row",
    alignItems: "center",
  },
  nicknameInputWrapper: {
    position: "relative",
    height: "100%",
  },
  dropdown: {
    position: "absolute",
    top: sc(36),
    left: 0,
    width: sc(160),
    borderRadius: sc(5),
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 100,
  },
  dropdownItem: {
    paddingHorizontal: sc(8),
    paddingVertical: sc(7),
  },
  dropdownItemText: {
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(15),
  },
  nicknameIconContainer: {
    height: sc(35),
    width: sc(35),
    justifyContent: "center",
    alignItems: "center",
    borderRadius: sc(5),
  },
});

NavBar.displayName = "NavBar";

export default NavBar;
