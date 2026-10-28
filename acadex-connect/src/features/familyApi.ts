import { api } from "../api/client";
import type {
  AttendanceSummary,
  Child,
  DailyActivity,
  FeesSummary,
  ReportSummary,
  SchoolEvent,
  TimetableEntry,
} from "../types/models";

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
};
