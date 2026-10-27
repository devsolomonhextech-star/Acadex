import { fireEvent, render } from "@testing-library/react-native";
import { EmptyState, PrimaryButton } from "./ui";

jest.mock("lucide-react-native", () => ({
  ArrowRight: () => null,
  CircleAlert: () => null,
  RefreshCw: () => null,
}));

describe("shared mobile UI", () => {
  it("shows a helpful empty state and retries when asked", async () => {
    const retry = jest.fn();
    const view = await render(
      <EmptyState
        title="No records"
        body="Nothing has been shared."
        retry={retry}
      />,
    );
    expect(view.getByText("No records")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("disables a busy primary action", async () => {
    const action = jest.fn();
    const view = await render(
      <PrimaryButton title="Sign in" onPress={action} busy />,
    );
    expect(view.getByRole("button").props.accessibilityState?.disabled).toBe(
      true,
    );
    await fireEvent.press(view.getByRole("button"));
    expect(action).not.toHaveBeenCalled();
  });
});
