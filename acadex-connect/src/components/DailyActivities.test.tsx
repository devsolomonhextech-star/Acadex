import { fireEvent, render } from "@testing-library/react-native";
import type { DailyActivity } from "../types/models";
import { DailyActivities } from "./DailyActivities";

jest.mock("lucide-react-native", () => ({
  CalendarDays: () => null,
  ChevronRight: () => null,
  CircleAlert: () => null,
  ClipboardList: () => null,
  FileText: () => null,
  PenLine: () => null,
  Puzzle: () => null,
  RefreshCw: () => null,
  Star: () => null,
  Target: () => null,
  Zap: () => null,
}));

jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    FadeInUp: { delay: () => ({ duration: () => undefined }) },
    default: { View },
  };
});

function activity(overrides: Partial<DailyActivity>): DailyActivity {
  return {
    id: `activity-${Math.random()}`,
    title: "Weekly quiz",
    category: "quiz",
    subject_name: "Mathematics",
    subject_code: "MTH",
    due_on: "2026-10-20",
    status: "open",
    state: "due_soon",
    max_score: "20.00",
    weight_percent: "10.00",
    score: null,
    score_percent: null,
    submission_status: "not_recorded",
    ...overrides,
  };
}

describe("DailyActivities", () => {
  const many = Array.from({ length: 8 }, (_, index) =>
    activity({
      id: `done-${index}`,
      title: `Completed task ${index}`,
      state: "completed",
      score: "18.00",
      score_percent: 90,
      submission_status: "submitted",
    }),
  );

  it("summarises, groups and orders activities by state", async () => {
    const view = await render(
      <DailyActivities
        activities={[
          activity({ id: "late", title: "Late homework", state: "overdue" }),
          activity({ id: "today", title: "Class test", state: "due_today" }),
          ...many.slice(0, 2),
        ]}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );
    expect(view.getAllByText("Overdue").length).toBeGreaterThanOrEqual(3);
    // "Due today" appears in the summary tile and the group header.
    expect(view.getAllByText("Due today").length).toBeGreaterThanOrEqual(2);
    expect(view.getAllByText("Completed").length).toBeGreaterThanOrEqual(2);
    // Overdue and due-today groups render before completed ones.
    const tree = JSON.stringify(view.toJSON());
    expect(tree.indexOf("Late homework")).toBeGreaterThan(-1);
    expect(tree.indexOf("Late homework")).toBeLessThan(
      tree.indexOf("Completed task 0"),
    );
    expect(tree.indexOf("Class test")).toBeLessThan(
      tree.indexOf("Completed task 0"),
    );
    expect(view.getAllByText("Marked · Tue, Oct 20").length).toBe(2);
    expect(view.getAllByText("18/20").length).toBe(2);
    expect(view.getAllByText("90%").length).toBe(2);
  });

  it("collapses long lists and expands them on demand", async () => {
    const view = await render(
      <DailyActivities
        activities={many}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );
    expect(view.queryByText("Completed task 7")).toBeNull();
    expect(view.getByText("Show all 8 activities")).toBeTruthy();
    await fireEvent.press(view.getByText("Show all 8 activities"));
    expect(view.getByText("Completed task 7")).toBeTruthy();
    expect(view.getByText("Show fewer activities")).toBeTruthy();
  });

  it("filters by category chips", async () => {
    const view = await render(
      <DailyActivities
        activities={[
          ...many.slice(0, 3),
          activity({
            id: "test-1",
            title: "Science class test",
            category: "class_test",
            state: "due_today",
          }),
        ]}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );
    expect(view.getByText("Science class test")).toBeTruthy();
    await fireEvent.press(view.getByText("Tests"));
    expect(view.getByText("Science class test")).toBeTruthy();
    expect(view.queryByText("Completed task 0")).toBeNull();
    await fireEvent.press(view.getByText("Quizzes"));
    expect(view.getByText("Completed task 0")).toBeTruthy();
    expect(view.queryByText("Science class test")).toBeNull();
  });

  it("shows empty and error states", async () => {
    const empty = await render(
      <DailyActivities
        activities={[]}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );
    expect(empty.getByText("No daily activities yet")).toBeTruthy();
    const failed = await render(
      <DailyActivities
        isLoading={false}
        error={new Error("boom")}
        onRetry={jest.fn()}
      />,
    );
    expect(failed.getByText("Activities could not load")).toBeTruthy();
  });
});
