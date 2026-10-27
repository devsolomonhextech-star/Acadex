import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, LockKeyhole } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { apiErrorMessage } from "../../../../src/api/client";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../../../src/components/ui";
import { familyApi } from "../../../../src/features/familyApi";
import { colors, radius } from "../../../../src/theme/tokens";
import type { TermReportCard } from "../../../../src/types/models";

export default function ReportCardScreen() {
  const { studentId, termId } = useLocalSearchParams<{
    studentId: string;
    termId: string;
  }>();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["report-card", studentId, termId],
    queryFn: ({ signal }) =>
      familyApi.report(studentId, termId, signal) as Promise<TermReportCard>,
    enabled: !!studentId && !!termId,
  });
  const shareReport = async () => {
    const card = query.data;
    if (!card) return;
    setBusy(true);
    try {
      const html = makeReportHtml(card);
      const { uri } = await (
        await import("expo-print")
      ).printToFileAsync({ html, base64: false });
      await (
        await import("expo-sharing")
      ).shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `${card.first_name} ${card.last_name} · ${card.term_name} report card`,
        UTI: "com.adobe.pdf",
      });
    } catch (cause) {
      Alert.alert("Could not create report PDF", apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Heading
        title="Term report"
        subtitle="Officially published results from your school."
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Report card unavailable"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          <Card style={styles.school}>
            <View style={styles.icon}>
              <FileText color={colors.blue} size={19} />
            </View>
            <Text style={styles.schoolName}>{query.data.school_name}</Text>
            <Text style={styles.term}>
              {query.data.academic_year_name} · {query.data.term_name}
            </Text>
            <Text style={styles.student}>
              {query.data.first_name} {query.data.last_name}
            </Text>
            <Text style={styles.meta}>
              {query.data.class_name}
              {query.data.class_stream
                ? ` · ${query.data.class_stream}`
                : ""} · {query.data.admission_number}
            </Text>
          </Card>
          <Card style={styles.aggregate}>
            <Text style={styles.label}>OVERALL RESULT</Text>
            <View style={styles.aggregateRow}>
              <Text style={styles.score}>
                {Number(query.data.aggregate_percent).toFixed(1)}%
              </Text>
              {query.data.aggregate_grade ? (
                <Text style={styles.grade}>{query.data.aggregate_grade}</Text>
              ) : null}
            </View>
            <Text style={styles.meta}>
              {query.data.grading_scale_name
                ? `Grading scale: ${query.data.grading_scale_name}`
                : "Official school grading"}
            </Text>
            {query.data.position != null ? (
              <Text style={styles.meta}>
                Class position {query.data.position}
                {query.data.class_size ? ` of ${query.data.class_size}` : ""}
              </Text>
            ) : null}
          </Card>
          <Text style={styles.section}>SUBJECT RESULTS</Text>
          {query.data.subjects.map((subject) => (
            <Card key={subject.subject_id} style={styles.subject}>
              <View style={{ flex: 1 }}>
                <Text style={styles.subjectName}>{subject.subject_name}</Text>
                <Text style={styles.meta}>
                  {subject.assessment_count} recorded assessment
                  {subject.assessment_count === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.subjectScore}>
                  {Number(subject.weighted_total).toFixed(1)}%
                </Text>
                {subject.grade ? (
                  <Text style={styles.subjectGrade}>Grade {subject.grade}</Text>
                ) : null}
              </View>
            </Card>
          ))}
          <Card style={styles.lock}>
            <LockKeyhole size={16} color={colors.success} />
            <Text style={styles.lockText}>
              This report is available because the school has published it.
              Results are read-only in the family app.
            </Text>
          </Card>
          <Pressable
            accessibilityRole="button"
            onPress={() => void shareReport()}
            disabled={busy}
            style={[styles.download, busy && { opacity: 0.6 }]}
          >
            <Download color="#fff" size={17} />
            <Text style={styles.downloadText}>
              {busy ? "Preparing PDF…" : "Download or share report card"}
            </Text>
          </Pressable>
          <Text style={styles.meta}>
            Published{" "}
            {query.data.published_at
              ? new Date(query.data.published_at).toLocaleDateString()
              : "date unavailable"}
            {query.data.published_by ? ` by ${query.data.published_by}` : ""}
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}
function makeReportHtml(card: TermReportCard) {
  const rows = card.subjects
    .map(
      (subject) =>
        `<tr><td>${escapeHtml(subject.subject_name)}</td><td>${Number(subject.weighted_total).toFixed(1)}%</td><td>${escapeHtml(subject.grade ?? "—")}</td><td>${subject.assessment_count}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;color:#15233b;padding:32px}header{border-bottom:3px solid #155eef;padding-bottom:18px;margin-bottom:24px}h1{font-size:24px;margin:0 0 8px;color:#12347a}h2{font-size:17px;margin:25px 0 12px}p{margin:5px 0;color:#65738a}.summary{background:#eef4ff;padding:18px;border-radius:10px;font-size:16px}table{width:100%;border-collapse:collapse}th,td{padding:12px 8px;border-bottom:1px solid #dce5f0;text-align:left}th{color:#65738a;font-size:11px;text-transform:uppercase}.score{font-size:25px;font-weight:bold;color:#155eef}footer{margin-top:36px;color:#65738a;font-size:10px}</style></head><body><header><h1>${escapeHtml(card.school_name)}</h1><p>${escapeHtml(card.academic_year_name)} · ${escapeHtml(card.term_name)}</p></header><h2>Student report</h2><p><b>${escapeHtml(card.first_name)} ${escapeHtml(card.last_name)}</b></p><p>${escapeHtml(card.class_name)} ${escapeHtml(card.class_stream)} · ${escapeHtml(card.admission_number)}</p><div class="summary"><span class="score">${Number(card.aggregate_percent).toFixed(1)}%</span> &nbsp; ${escapeHtml(card.aggregate_grade ?? "")}${card.position == null ? "" : `<p>Class position ${card.position}${card.class_size ? ` of ${card.class_size}` : ""}</p>`}</div><h2>Subject results</h2><table><thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>Assessments</th></tr></thead><tbody>${rows}</tbody></table><footer>Published ${card.published_at ? new Date(card.published_at).toLocaleDateString() : ""}${card.published_by ? ` · ${escapeHtml(card.published_by)}` : ""}. Generated by Acadex Connect.</footer></body></html>`;
}
const styles = StyleSheet.create({
  school: { alignItems: "center", padding: 20 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  schoolName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "center",
  },
  term: { color: colors.blue, fontSize: 12, fontWeight: "700", marginTop: 4 },
  student: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
  },
  meta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  aggregate: { padding: 18 },
  label: {
    color: colors.mutedLight,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "800",
  },
  aggregateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 5,
  },
  score: { color: colors.blue, fontSize: 30, fontWeight: "800" },
  grade: {
    color: colors.success,
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    overflow: "hidden",
    paddingHorizontal: 11,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: "800",
  },
  section: {
    color: colors.mutedLight,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  subject: { flexDirection: "row", alignItems: "center" },
  subjectName: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  subjectScore: { color: colors.blueDeep, fontSize: 15, fontWeight: "800" },
  subjectGrade: { color: colors.muted, fontSize: 10, marginTop: 3 },
  lock: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.successSoft,
    borderColor: "#CDEBDD",
  },
  lockText: { flex: 1, color: colors.success, fontSize: 11, lineHeight: 17 },
  download: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  downloadText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
