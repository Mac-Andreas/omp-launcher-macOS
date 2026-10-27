import { clipboard } from "@tauri-apps/api";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Icon from "../../components/Icon";
import StaticModal from "../../components/StaticModal";
import Text from "../../components/Text";
import { images } from "../../constants/images";
import { useAddThirdPartyServerModal } from "../../states/addThirdPartyServerModal";
import { usePersistentServers } from "../../states/servers";
import { useTheme } from "../../states/theme";
import { sc } from "../../utils/sizeScaler";
import { Server } from "../../utils/types";
import {
  isValidDomain,
  validatePort,
  validateServerAddressIPv4,
} from "../../utils/validation";

// Warning accent — mirrors the empty-nickname alert in the NavBar so the two
// validation surfaces feel consistent.
const WARN_COLOR = "#E08A33";

// Parse a typed address into { host, port } or an error key. Tolerates messy
// paste: trims whitespace, strips a stray space after the ":" or before the
// host, drops a samp:// or omp:// scheme. Only a real IPv4/domain (optionally
// with a valid :port) is accepted — anything else returns an error.
type ParseResult =
  | { ok: true; host: string; port: number }
  | { ok: false; error: string };

const parseAddress = (raw: string): ParseResult => {
  // Auto-fix: collapse all whitespace (handles a leading gap like " s3.gta…"
  // or "host: 7777") and drop a leading scheme.
  const cleaned = raw.replace(/\s+/g, "").replace(/^[a-z]+:\/\//i, "");
  if (!cleaned) return { ok: false, error: "empty" };

  let host = cleaned;
  let port = 7777;

  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    if (parts.length !== 2) return { ok: false, error: "format" };
    host = parts[0];
    if (!validatePort(parts[1])) return { ok: false, error: "port" };
    port = parseInt(parts[1], 10);
  }

  if (!validateServerAddressIPv4(host) && !isValidDomain(host)) {
    return { ok: false, error: "host" };
  }
  return { ok: true, host, port };
};

const AddThirdPartyServerModal = () => {
  const { visible, showAddThirdPartyServer } = useAddThirdPartyServerModal();
  const { height, width } = useWindowDimensions();
  const { theme } = useTheme();
  const [serverAddress, setServerAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { addToFavorites } = usePersistentServers();

  useEffect(() => {
    if (visible) {
      setError(null);
      clipboard.readText().then((text) => {
        // Auto-fix a pasted address right away (trim the leading/trailing gap)
        // so the field never shows the " host" form the old modal stored.
        if (text) setServerAddress(text.trim());
      });
    } else {
      setServerAddress("");
      setError(null);
    }
  }, [visible]);

  // Clear the error as soon as the user edits toward something valid.
  const onChange = useCallback((text: string) => {
    setServerAddress(text);
    if (error) setError(null);
  }, [error]);

  const addServer = useCallback(() => {
    const parsed = parseAddress(serverAddress);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const serverInfo: Server = {
      ip: parsed.host,
      port: parsed.port,
      hostname: `No information (${parsed.host}:${parsed.port})`,
      playerCount: 0,
      maxPlayers: 0,
      gameMode: "-",
      language: "-",
      hasPassword: false,
      version: "-",
      usingOmp: false,
      partner: false,
      ping: 0,
      players: [],
      password: "",
      rules: {} as Server["rules"],
    };

    addToFavorites(serverInfo);
    showAddThirdPartyServer(false);
  }, [serverAddress, addToFavorites, showAddThirdPartyServer]);

  const errorText = useMemo(() => {
    switch (error) {
      case "empty":
        return t("add_server_error_empty", {
          defaultValue: "Enter a server address.",
        });
      case "port":
        return t("add_server_error_port", {
          defaultValue: "Port must be a number between 1 and 65535.",
        });
      case "format":
        return t("add_server_error_format", {
          defaultValue: "Use the format IP:Port or domain:Port.",
        });
      default:
        return t("add_server_error_host", {
          defaultValue: "Enter a valid IP address or domain (e.g. play.server.com:7777).",
        });
    }
  }, [error]);

  const dynamicStyles = useMemo(
    () => ({
      container: {
        top: height / 2 - 150,
        left: width / 2 - 190,
        backgroundColor: theme.secondary,
        borderColor: `${theme.textPrimary}1A`,
      },
      iconBadge: {
        backgroundColor: `${theme.primary}1F`,
      },
      textInput: {
        color: theme.textPrimary,
        backgroundColor: theme.textInputBackgroundColor,
        borderColor: error ? `${WARN_COLOR}99` : `${theme.textPrimary}1F`,
      },
      addButton: {
        backgroundColor: theme.primary,
      },
    }),
    [height, width, theme, error]
  );

  if (!visible) {
    return null;
  }

  return (
    <StaticModal onDismiss={() => showAddThirdPartyServer(false)}>
      <View style={[styles.container, dynamicStyles.container]}>
        {/* Header: icon badge + title */}
        <View style={styles.header}>
          <View style={[styles.iconBadge, dynamicStyles.iconBadge]}>
            <Icon image={images.icons.favorite} size={sc(22)} color={theme.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: sc(12) }}>
            <Text semibold color={theme.textPrimary} size={3}>
              {t("add_server_modal_title", { defaultValue: "Add a server" })}
            </Text>
            <Text color={`${theme.textPrimary}99`} size={1} style={{ marginTop: sc(2) }}>
              {t("add_server_modal_description_1", {
                defaultValue: "Add a server to your favourites by address.",
              })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => showAddThirdPartyServer(false)}
          >
            <Icon image={images.icons.close} size={sc(18)} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Address field */}
        <Text
          semibold
          color={`${theme.textPrimary}B3`}
          size={1}
          style={styles.fieldLabel}
        >
          {t("add_server_field_label", { defaultValue: "SERVER ADDRESS" })}
        </Text>
        <TextInput
          placeholder={"play.server.com:7777"}
          placeholderTextColor={theme.textPlaceholder}
          value={serverAddress}
          onSubmitEditing={addServer}
          onChangeText={onChange}
          autoFocus
          style={[styles.textInput, dynamicStyles.textInput]}
        />

        {/* Orange validation bar (mirrors the empty-nickname alert) */}
        {error ? (
          <View style={styles.errorBar}>
            <Icon image={images.icons.warning} size={sc(15)} color={WARN_COLOR} />
            <Text size={1} color={WARN_COLOR} style={{ marginLeft: sc(7), flex: 1 }}>
              {errorText}
            </Text>
          </View>
        ) : (
          <Text size={1} color={`${theme.textPrimary}66`} style={styles.hint}>
            {t("add_server_field_hint", {
              defaultValue: "Port is optional — defaults to 7777.",
            })}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.addButton, dynamicStyles.addButton]}
          onPress={addServer}
        >
          <Icon image={images.icons.favorite} size={sc(16)} color="#FFFFFF" />
          <Text semibold color={"#FFFFFF"} size={2} style={{ marginLeft: sc(8) }}>
            {t("add_server_add_to_favorites", { defaultValue: "Add to Favourites" })}
          </Text>
        </TouchableOpacity>
      </View>
    </StaticModal>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: 380,
    borderRadius: sc(14),
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    overflow: "hidden",
    paddingHorizontal: sc(18),
    paddingTop: sc(16),
    paddingBottom: sc(18),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBadge: {
    height: sc(40),
    width: sc(40),
    borderRadius: sc(10),
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    height: sc(24),
    width: sc(24),
    alignItems: "center",
    justifyContent: "center",
    marginLeft: sc(8),
  },
  fieldLabel: {
    letterSpacing: 1,
    marginTop: sc(18),
    marginBottom: sc(7),
  },
  textInput: {
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(16),
    paddingHorizontal: sc(12),
    width: "100%",
    height: sc(42),
    borderRadius: sc(8),
    borderWidth: 1,
    // @ts-ignore
    outlineStyle: "none",
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sc(10),
    paddingVertical: sc(8),
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    borderColor: `${WARN_COLOR}99`,
    backgroundColor: `${WARN_COLOR}1F`,
  },
  hint: {
    marginTop: sc(8),
  },
  addButton: {
    flexDirection: "row",
    width: "100%",
    height: sc(44),
    marginTop: sc(16),
    borderRadius: sc(9),
    justifyContent: "center",
    alignItems: "center",
  },
});

export default AddThirdPartyServerModal;
