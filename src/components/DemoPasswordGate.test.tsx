import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DemoPasswordGate } from "./DemoPasswordGate";

const STORAGE_KEY = "nfaChatbotDemoUnlocked";

beforeEach(() => {
  sessionStorage.removeItem(STORAGE_KEY);
});

describe("DemoPasswordGate", () => {
  it("hides the children behind a password form", () => {
    render(
      <DemoPasswordGate>
        <p>secret content</p>
      </DemoPasswordGate>,
    );
    expect(screen.queryByText("secret content")).toBeNull();
    expect(screen.getByLabelText("Password")).not.toBeNull();
  });

  it("rejects the wrong password", () => {
    render(
      <DemoPasswordGate>
        <p>secret content</p>
      </DemoPasswordGate>,
    );
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByText("Enter"));
    expect(screen.getByText("That is not it.")).not.toBeNull();
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("reveals the children once the right password is entered, case-insensitively", () => {
    render(
      <DemoPasswordGate>
        <p>secret content</p>
      </DemoPasswordGate>,
    );
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "GroutExpectations" },
    });
    fireEvent.click(screen.getByText("Enter"));
    expect(screen.getByText("secret content")).not.toBeNull();
  });

  it("stays unlocked across a remount in the same session", () => {
    const { unmount } = render(
      <DemoPasswordGate>
        <p>secret content</p>
      </DemoPasswordGate>,
    );
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "groutexpectations" },
    });
    fireEvent.click(screen.getByText("Enter"));
    unmount();

    render(
      <DemoPasswordGate>
        <p>secret content</p>
      </DemoPasswordGate>,
    );
    expect(screen.getByText("secret content")).not.toBeNull();
  });
});
