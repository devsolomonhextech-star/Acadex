import { api } from "../api/client";
import type {
  AttendanceSummary,
  Child,
  DailyActivity,
  FeesSummary,
  ParentRequestDetail,
  ParentRequestInbox,
  ParentRequestTopic,
  ReportSummary,
  SchoolEvent,
  TimetableEntry,
} from "../types/models";

export type WeeklySummary = {
  week_start: string;
  week_end: string;
  days_recorded: number;
  attendance: { present: number; late: number; absent: number; excused: number };
  results: { title: string; subject: string; score_percent: number | null; updated_at: string }[];
  average_score_percent: number | null;
};

export const familyApi = {
  children: async (signal?: AbortSignal) =>
    (await api.get<Child[]>("/family/children", { signal })).data,
  reports: async (studentId: string, signal?: AbortSignal) =>
    (
      await api.get<ReportSummary[]>(`/family/report-cards/${studentId}`, {
        signal,
      })
    ).data,
  report: async (studentId: string, termId: string, signal?: AbortSignal) =>
    (
      await api.get<Record<string, unknown>>(
        `/family/report-cards/${studentId}/${termId}`,
        { signal },
      )
    ).data,
  attendance: async (studentId: string, signal?: AbortSignal) =>
    (
      await api.get<AttendanceSummary>(`/family/attendance/${studentId}`, {
        signal,
      })
    ).data,
  weeklySummary: async (studentId: string, signal?: AbortSignal) =>
    (await api.get<WeeklySummary>(`/family/weekly-summary/${studentId}`, { signal })).data,
  fees: async (studentId: string, signal?: AbortSignal) =>
    (await api.get<FeesSummary>(`/family/fees/${studentId}`, { signal })).data,
  timetable: async (studentId: string, signal?: AbortSignal) =>
    (
      await api.get<TimetableEntry[]>(`/family/timetable/${studentId}`, {
        signal,
      })
    ).data,
  events: async (studentId: string, signal?: AbortSignal) =>
    (await api.get<SchoolEvent[]>(`/family/events/${studentId}`, { signal }))
      .data,
  activities: async (studentId: string, signal?: AbortSignal) =>
    (
      await api.get<DailyActivity[]>(`/family/activities/${studentId}`, {
        signal,
      })
    ).data,
  requests: async (signal?: AbortSignal) =>
    (await api.get<ParentRequestInbox>("/family/requests", { signal })).data,
  request: async (requestId: string, signal?: AbortSignal) =>
    (
      await api.get<ParentRequestDetail>(`/family/requests/${requestId}`, {
        signal,
      })
    ).data,
  createRequest: async (payload: {
    topic: ParentRequestTopic;
    subject: string;
    message: string;
    student_id: string | null;
  }) => (await api.post<ParentRequestDetail>("/family/requests", payload)).data,
  replyToRequest: async (requestId: string, body: string) =>
    (
      await api.post<ParentRequestDetail>(
        `/family/requests/${requestId}/messages`,
        { body },
      )
    ).data,
};
