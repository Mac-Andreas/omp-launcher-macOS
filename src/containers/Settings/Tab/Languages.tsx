import { t } from "i18next";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Text from "../../../components/Text";
import ThemedDropdown from "../../../components/ThemedDropdown";
import { getLanguages } from "../../../locales";
import { useGenericPersistentState } from "../../../states/genericStates";
import { useSettings } from "../../../states/settings";
import { useSettingsModal } from "../../../states/settingsModal";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";

const Preferences = () => {
  const { language, setLanguage } = useGenericPersistentState();
  const { theme, setTheme } = useTheme();
  const themeMode = useTheme((s) => s.themeMode);
  const { hide: hideSettings } = useSettingsModal();
  const { nickName, setNickName } = useSettings();

  // Map a language label back to its `type` key. The dropdown speaks display
  // strings; the persisted state speaks type codes.
  const languages = Object.entries(getLanguages());
  const labelByType: Record<string, string> = {};
  const typeByLabel: Record<string, string> = {};
  for (const [, lang] of languages) {
    labelByType[lang.type] = lang.label;
    typeByLabel[lang.label] = lang.type;
  }
  const currentLanguageLabel = labelByType[language] || languages[0]?.[1].label || "";
  const languageItems = languages.map(([, lang]) => lang.label);

  const ThemeOption = ({
    value,
    label,
  }: {
    value: "dark" | "light" | "system";
    label: string;
  }) => {
    const selected = themeMode === value;
    return (
      <Pressable
        onPress={() => setTheme(value)}
        style={({ hovered }: any) => [
          styles.themeOption,
          {
            backgroundColor: selected
              ? `${theme.primary}1F`
              : hovered
              ? `${theme.textPrimary}0A`
              : "transparent",
            borderColor: selected ? `${theme.primary}99` : `${theme.textPrimary}1F`,
          },
        ]}
      >
        <View
          style={[
            styles.themeSwatch,
            {
              backgroundColor:
                value === "dark"
                  ? "#1E1E22"
                  : value === "light"
                  ? "#F4F4F6"
                  : "transparent",
              borderColor: `${theme.textPrimary}24`,
              overflow: "hidden",
            },
          ]}
        >
          {value === "system" && (
            <>
              <View style={[styles.swatchHalf, { backgroundColor: "#1E1E22" }]} />
              <View
                style={[
                  styles.swatchHalf,
                  styles.swatchHalfRight,
                  { backgroundColor: "#F4F4F6" },
                ]}
              />
            </>
          )}
        </View>
        <Text
          semibold={selected}
          size={2}
          color={selected ? theme.primary : theme.textPrimary}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text semibold size={2} color={theme.textPrimary}>
        {t("settings_prefs_nickname_title", { defaultValue: "Default nickname" })}
      </Text>
      <Text
        size={1}
        color={`${theme.textPrimary}88`}
        style={styles.sectionSub}
        numberOfLines={0}
      >
        {t("settings_prefs_nickname_subtitle", {
          defaultValue:
            "Used when a server does not have a per-server override set.",
        })}
      </Text>
      <TextInput
        value={nickName}
        onChangeText={setNickName}
        placeholder={t("settings_prefs_nickname_placeholder", {
          defaultValue: "Nickname",
        })}
        placeholderTextColor={`${theme.textPrimary}66`}
        // @ts-ignore
        style={[
          styles.input,
          {
            color: theme.textPrimary,
            backgroundColor: theme.itemBackgroundColor,
            borderColor: `${theme.textPrimary}26`,
          },
        ]}
      />

      <View
        style={[styles.divider, { backgroundColor: `${theme.textPrimary}14` }]}
      />

      <Text semibold size={2} color={theme.textPrimary}>
        {t("settings_prefs_lang_section_title", { defaultValue: "Language" })}
      </Text>
      <Text size={1} color={`${theme.textPrimary}88`} style={styles.sectionSub}>
        {t("settings_prefs_lang_subtitle", {
          defaultValue: "Reloads the launcher after a change.",
        })}
      </Text>
      <ThemedDropdown
        value={currentLanguageLabel}
        items={languageItems}
        onChange={(label) => {
          const type = typeByLabel[label];
          if (type) {
            // typeByLabel mirrors getLanguages() keys, which match the
            // LanguageType union — safe to assert.
            setLanguage(type as any);
            hideSettings();
          }
        }}
        maxVisibleItems={8}
      />

      <View
        style={[styles.divider, { backgroundColor: `${theme.textPrimary}14` }]}
      />

      <Text semibold size={2} color={theme.textPrimary}>
        {t("settings_prefs_theme_title", { defaultValue: "Appearance" })}
      </Text>
      <Text size={1} color={`${theme.textPrimary}88`} style={styles.sectionSub}>
        {t("settings_prefs_theme_subtitle", {
          defaultValue: "Light or dark interface.",
        })}
      </Text>
      <View style={styles.themeRow}>
        <ThemeOption
          value="system"
          label={t("settings_theme_system", { defaultValue: "System" })}
        />
        <ThemeOption
          value="dark"
          label={t("settings_theme_dark", { defaultValue: "Dark" })}
        />
        <ThemeOption
          value="light"
          label={t("settings_theme_light", { defaultValue: "Light" })}
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
  themeRow: {
    flexDirection: "row",
    gap: sc(8),
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
    paddingVertical: sc(10),
    paddingHorizontal: sc(12),
    borderRadius: sc(8),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
  themeSwatch: {
    width: sc(28),
    height: sc(20),
    borderRadius: sc(4),
    borderWidth: 1,
    flexDirection: "row",
  },
  swatchHalf: {
    flex: 1,
    height: "100%",
  },
  swatchHalfRight: {},
});

export default Preferences;
