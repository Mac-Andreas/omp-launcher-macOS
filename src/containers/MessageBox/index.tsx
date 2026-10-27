import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as Animatable from "react-native-animatable";
import Icon from "../../components/Icon";
import StaticModal from "../../components/StaticModal";
import Text from "../../components/Text";
import { images } from "../../constants/images";
import { useMessageBox } from "../../states/messageModal";
import { useTheme } from "../../states/theme";
import { sc } from "../../utils/sizeScaler";
import { Log } from "../../utils/logger";

const MessageBox = memo(() => {
  const { args, visible, hideMessageBox } = useMessageBox();
  const { height, width } = useWindowDimensions();
  const { theme } = useTheme();
  const modalRef = useRef<Animatable.View>(null);
  const hasShownRef = useRef(false);

  // Reset animation state when modal becomes visible
  useEffect(() => {
    if (visible && !hasShownRef.current) {
      hasShownRef.current = true;
    } else if (!visible) {
      hasShownRef.current = false;
    }
  }, [visible]);

  // dismissed = closed via the X or a click outside, i.e. no button chosen.
  // Only then do we fire args.onClose so callers can treat it as a cancel
  // (e.g. the audio-crash gate aborts the held launch). A button press passes
  // dismissed=false so its own onPress is the sole action.
  const handleClose = useCallback(
    (dismissed = true) => {
      const onClose = dismissed ? useMessageBox.getState().args?.onClose : undefined;
      const finish = () => {
        hideMessageBox();
        onClose?.();
      };
      if (modalRef.current) {
        modalRef.current.zoomOut?.(300).then(finish);
      } else {
        finish();
      }
    },
    [hideMessageBox]
  );

  const handleButtonPress = useCallback(
    (button: any) => {
      if (button.disabled) return;
      // Some buttons update the same dialog in place and must not close it.
      const shouldClose = button.closeOnPress !== false;
      try {
        button.onPress?.();
      } catch (error) {
        Log.error("Error in MessageBox button handler:", error);
      } finally {
        if (shouldClose) handleClose(false);
      }
    },
    [handleClose]
  );

  const dynamicStyles = useMemo(() => {
    if (!args) return {};

    const boxWidth = args.boxWidth || 300;
    const buttonWidth = args.buttonWidth || 100;

    return {
      container: {
        // Fixed estimate of half the box height so it sits centred. The
        // vertical-button layout is taller (stacked buttons), so lift it more
        // to keep its centre on the screen centre.
        top: height / 2 - (args.verticalButtons ? 170 : 115),
        left: width / 2 - boxWidth / 2,
        width: boxWidth,
        backgroundColor: theme.secondary,
      },
      titleText: {
        width: Math.max(boxWidth - 70, 180),
      },
      descriptionContainer: {
        width: Math.max(boxWidth - 30, 270),
      },
      buttonContainer: {
        width: boxWidth,
      },
      button: {
        // In the vertical layout buttons fill the dialog width (minus the side
        // padding) so long labels never truncate; otherwise use the fixed width.
        width: args.verticalButtons ? Math.max(boxWidth - 60, 200) : buttonWidth,
        backgroundColor: theme.primary,
      },
    };
  }, [height, width, args, theme]);

  // Early return with better condition
  if (!visible || !args) {
    return null;
  }

  return (
    <StaticModal onDismiss={() => handleClose()}>
      <Animatable.View
        ref={modalRef}
        animation="zoomInUp"
        duration={500}
        style={[styles.container, dynamicStyles.container]}
      >
        <Text
          semibold
          size={3}
          color={theme.primary}
          style={[styles.titleText, dynamicStyles.titleText]}
        >
          {args.title}
        </Text>
        <View
          style={[
            styles.descriptionContainer,
            dynamicStyles.descriptionContainer,
          ]}
        >
          <Text color={theme.textPrimary} size={2} numberOfLines={10}>
            {args.description}
          </Text>
        </View>
        <View
          style={[
            styles.buttonContainer,
            args.verticalButtons && styles.buttonContainerVertical,
            dynamicStyles.buttonContainer,
          ]}
        >
          {args.buttons?.map((button, index) => {
            // Row layout: the last (rightmost) button is the primary action.
            // Vertical layout: the first (top) button is, since the top of a
            // stack reads as the recommended choice.
            const isPrimary = args.verticalButtons
              ? index === 0
              : index === args.buttons.length - 1;
            return (
              <TouchableOpacity
                key={`message-box-button-${button.title}-${index}`}
                style={[
                  styles.button,
                  dynamicStyles.button,
                  isPrimary && styles.primaryButton,
                  button.disabled && styles.disabledButton,
                ]}
                onPress={() => handleButtonPress(button)}
                disabled={button.disabled}
                accessible
                accessibilityRole="button"
                accessibilityLabel={button.title}
              >
                <Text
                  semibold
                  color={button.disabled ? "#FFFFFF88" : "#FFFFFF"}
                  size={2}
                >
                  {button.title}
                  {button.hint ? (
                    // Native title attr renders an OS tooltip on hover. RNW maps
                    // unknown props through, so this lands as a real <span title>.
                    // @ts-ignore
                    <Text size={1} color="#FFFFFFCC" title={button.hint}>
                      {"  (?)"}
                    </Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
            );
          }) || []}
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => handleClose()}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
        >
          <Icon
            image={images.icons.close}
            size={sc(20)}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </Animatable.View>
    </StaticModal>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    borderRadius: sc(10),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    alignItems: "center",
    overflow: "hidden",
    paddingVertical: sc(15),
  },
  titleText: {
    textAlign: "center",
  },
  descriptionContainer: {
    marginTop: 5,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    flexWrap: "wrap",
    height: 30,
    marginTop: 10,
  },
  // Column layout for long button labels: auto height (no fixed 30px row),
  // buttons centered and stacked.
  buttonContainerVertical: {
    flexDirection: "column",
    flexWrap: "nowrap",
    height: "auto",
    gap: sc(8),
  },
  button: {
    paddingHorizontal: sc(10),
    height: sc(36),
    marginTop: sc(5),
    borderRadius: sc(5),
    justifyContent: "center",
    alignItems: "center",
    minWidth: sc(80),
  },
  primaryButton: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  disabledButton: {
    opacity: 0.4,
  },
  closeButton: {
    position: "absolute",
    top: sc(15),
    right: sc(15),
    height: sc(20),
    width: sc(20),
  },
});

export default MessageBox;
