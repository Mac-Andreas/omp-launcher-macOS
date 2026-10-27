import { memo, useMemo, useState } from "react";
import {
  ScrollView,
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
import {
  FeedbackPage,
  FeedbackQuestion,
  useFeedback,
} from "../../states/feedback";
import { useTheme } from "../../states/theme";
import { sc } from "../../utils/sizeScaler";

const CARD_WIDTH = 440;
const TITLEBAR_HEIGHT = 25;
const MODAL_MARGIN_Y = 56;

// Paged feedback popup. Styled like the Settings modal and closable ONLY via
// the ✕ in the header — the backdrop is inert (no click-to-dismiss) and there
// is no Skip button. Pages come from campaign.pages[]; legacy flat campaigns
// (campaign.questions[]) are wrapped in a single page.
const FeedbackPrompt = memo(() => {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const campaign = useFeedback((s) => s.campaign);
  const popupOpen = useFeedback((s) => s.popupOpen);
  const closePopup = useFeedback((s) => s.closePopup);
  const submit = useFeedback((s) => s.submit);

  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [pageIdx, setPageIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const pages: FeedbackPage[] = useMemo(() => {
    if (!campaign) return [];
    if (campaign.pages?.length) return campaign.pages;
    return [{ title: campaign.title, questions: campaign.questions || [] }];
  }, [campaign]);

  if (!popupOpen || !campaign) return null;

  const currentPage = pages[pageIdx] || { questions: [] };
  const isLastPage = pageIdx >= pages.length - 1;
  const isFirstPage = pageIdx <= 0;

  const setAnswer = (key: string, val: string | number) =>
    setAnswers((a) => ({ ...a, [key]: val }));

  const handleClose = () => {
    closePopup();
    // Reset so a re-open starts fresh.
    setPageIdx(0);
    setAnswers({});
    setSubmitted(false);
  };

  const handleNext = () => {
    if (isLastPage) {
      submit(answers).then(() => setSubmitted(true));
    } else {
      setPageIdx((p) => p + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstPage) setPageIdx((p) => p - 1);
  };

  const cardHeight = Math.min(540, height - MODAL_MARGIN_Y);
  const top = Math.max(
    TITLEBAR_HEIGHT,
    height / 2 - cardHeight / 2 - TITLEBAR_HEIGHT
  );

  return (
    // onDismiss is a no-op: this popup is closable only via the ✕.
    <StaticModal onDismiss={() => {}}>
      <View
        style={[
          styles.card,
          {
            top,
            left: "50%",
            transform: [{ translateX: -CARD_WIDTH / 2 } as any],
            maxHeight: cardHeight,
            width: CARD_WIDTH,
            backgroundColor: theme.secondary,
            borderColor: `${theme.textPrimary}1F`,
          },
        ]}
      >
        {/* Header — title + ✕ (only way out). */}
        <View
          style={[styles.header, { borderBottomColor: `${theme.textPrimary}1F` }]}
        >
          <Text
            semibold
            size={3}
            color={theme.textPrimary}
            numberOfLines={1}
            style={styles.headerTitle}
          >
            {campaign.title}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Icon
              image={images.icons.close}
              size={sc(18)}
              color={`${theme.textPrimary}99`}
            />
          </TouchableOpacity>
        </View>

        {submitted ? (
          <View style={styles.thanks}>
            <Text style={styles.thanksEmoji}>🎉</Text>
            <Text semibold size={3} color={theme.textPrimary}>
              Thank you!
            </Text>
            <Text
              size={2}
              color={`${theme.textPrimary}99`}
              style={styles.thanksSub}
            >
              Your feedback has been submitted.
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            >
              <Text semibold size={2} color="#FFFFFF">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Flowchart of pages: *-*-* with the current node filled. Only
                shown for multi-page campaigns. No text labels. */}
            {pages.length > 1 && (
              <View style={styles.flowchart}>
                {pages.map((_, i) => (
                  <View key={i} style={styles.flowNodeWrap}>
                    {i > 0 && (
                      <View
                        style={[
                          styles.flowLine,
                          {
                            backgroundColor:
                              i <= pageIdx
                                ? theme.primary
                                : `${theme.textPrimary}33`,
                          },
                        ]}
                      />
                    )}
                    <View
                      style={[
                        styles.flowNode,
                        {
                          backgroundColor:
                            i === pageIdx
                              ? theme.primary
                              : i < pageIdx
                              ? `${theme.primary}88`
                              : `${theme.textPrimary}33`,
                          borderColor:
                            i === pageIdx ? theme.primary : "transparent",
                        },
                      ]}
                    />
                  </View>
                ))}
              </View>
            )}

            {/* Questions — scrollable. */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {campaign.description && pageIdx === 0 && (
                <Text
                  size={2}
                  color={`${theme.textPrimary}99`}
                  style={styles.description}
                  numberOfLines={0}
                >
                  {campaign.description}
                </Text>
              )}
              {(currentPage.questions || []).map((q, qi) => (
                <QuestionField
                  key={`${pageIdx}_${qi}`}
                  index={qi}
                  question={q}
                  value={answers[`${pageIdx}_${qi}`]}
                  onChange={(v) => setAnswer(`${pageIdx}_${qi}`, v)}
                />
              ))}
            </ScrollView>

            {/* Footer — two-button tile: Back + Next/Submit. */}
            <View
              style={[styles.footer, { borderTopColor: `${theme.textPrimary}1F` }]}
            >
              <TouchableOpacity
                onPress={handleBack}
                disabled={isFirstPage}
                style={[
                  styles.footerBtn,
                  {
                    backgroundColor: theme.itemBackgroundColor,
                    borderColor: `${theme.textPrimary}22`,
                    opacity: isFirstPage ? 0.4 : 1,
                  },
                ]}
              >
                <Text semibold size={2} color={theme.textSecondary}>
                  ← Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNext}
                style={[styles.footerBtn, { backgroundColor: theme.primary }]}
              >
                <Text semibold size={2} color="#FFFFFF">
                  {isLastPage ? "Submit" : "Next →"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </StaticModal>
  );
});

// A single question: likert (1–5), mcq (radio-style), or free text.
const QuestionField = ({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: FeedbackQuestion;
  value: string | number | undefined;
  onChange: (val: string | number) => void;
}) => {
  const { theme } = useTheme();
  return (
    <View style={styles.question}>
      <Text
        semibold
        size={2}
        color={theme.textPrimary}
        style={styles.questionText}
        numberOfLines={0}
      >
        {index + 1}. {question.text}
      </Text>

      {question.type === "likert" ? (
        <>
          <View style={styles.likertRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => onChange(n)}
                style={[
                  styles.likertCell,
                  {
                    backgroundColor:
                      value === n ? theme.primary : theme.itemBackgroundColor,
                    borderColor:
                      value === n ? theme.primary : `${theme.textPrimary}44`,
                  },
                ]}
              >
                <Text
                  semibold
                  size={2}
                  color={value === n ? "#FFFFFF" : theme.textPrimary}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.likertLabels}>
            <Text size={1} color={`${theme.textPrimary}88`}>
              {question.label1 || "Strongly disagree"}
            </Text>
            <Text size={1} color={`${theme.textPrimary}88`}>
              {question.label5 || "Strongly agree"}
            </Text>
          </View>
        </>
      ) : question.type === "mcq" ? (
        <View style={styles.mcqList}>
          {(question.options || []).map((opt, oi) => (
            <TouchableOpacity
              key={oi}
              onPress={() => onChange(opt)}
              style={[
                styles.mcqOption,
                {
                  backgroundColor:
                    value === opt
                      ? `${theme.primary}22`
                      : theme.itemBackgroundColor,
                  borderColor:
                    value === opt ? theme.primary : `${theme.textPrimary}44`,
                },
              ]}
            >
              <Text
                size={2}
                color={value === opt ? theme.primary : theme.textPrimary}
              >
                {value === opt ? "● " : "○ "}
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TextInput
          value={String(value ?? "")}
          onChangeText={onChange}
          placeholder="Your answer…"
          placeholderTextColor={theme.textPlaceholder}
          multiline
          // @ts-ignore — RN-Web extends TextInput
          style={[
            styles.textInput,
            {
              color: theme.textPrimary,
              backgroundColor: theme.itemBackgroundColor,
              borderColor: `${theme.textPrimary}44`,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    borderRadius: sc(12),
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: sc(8) },
    shadowOpacity: 0.45,
    shadowRadius: sc(24),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sc(16),
    paddingVertical: sc(12),
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
  },
  closeButton: {
    height: sc(20),
    width: sc(20),
    alignItems: "center",
    justifyContent: "center",
    marginLeft: sc(8),
  },
  flowchart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sc(12),
  },
  flowNodeWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  flowLine: {
    width: sc(28),
    height: sc(2),
  },
  flowNode: {
    width: sc(10),
    height: sc(10),
    borderRadius: sc(5),
    borderWidth: 1,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: sc(16),
    paddingTop: sc(8),
    paddingBottom: sc(8),
  },
  description: {
    marginBottom: sc(14),
    lineHeight: sc(18),
  },
  question: {
    marginBottom: sc(18),
  },
  questionText: {
    marginBottom: sc(10),
    lineHeight: sc(18),
  },
  likertRow: {
    flexDirection: "row",
    gap: sc(6),
  },
  likertCell: {
    flex: 1,
    height: sc(38),
    borderRadius: sc(6),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  likertLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: sc(5),
  },
  mcqList: {
    gap: sc(6),
  },
  mcqOption: {
    paddingVertical: sc(9),
    paddingHorizontal: sc(11),
    borderRadius: sc(6),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
  textInput: {
    minHeight: sc(64),
    borderRadius: sc(6),
    borderWidth: 1,
    padding: sc(10),
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(14),
    textAlignVertical: "top",
    // @ts-ignore
    outlineStyle: "none",
    // @ts-ignore
    resize: "vertical",
  },
  footer: {
    flexDirection: "row",
    gap: sc(10),
    paddingHorizontal: sc(16),
    paddingVertical: sc(12),
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    height: sc(40),
    borderRadius: sc(8),
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  thanks: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sc(24),
    paddingVertical: sc(40),
  },
  thanksEmoji: {
    fontSize: sc(34),
    marginBottom: sc(8),
  },
  thanksSub: {
    marginTop: sc(6),
    marginBottom: sc(22),
    textAlign: "center",
  },
  primaryBtn: {
    height: sc(40),
    borderRadius: sc(8),
    paddingHorizontal: sc(40),
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "pointer",
  },
});

FeedbackPrompt.displayName = "FeedbackPrompt";

export default FeedbackPrompt;
