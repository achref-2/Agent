import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskRow } from "../components/tasks";
import type { Task } from "../lib/types";

const task: Task = {
  id: "1", title: "Submit DSP assignment", description: "", category: "university", priority: "urgent", status: "todo",
  dueDate: "2026-10-15", dueTime: "12:00", reminderAt: null, reminderSentAt: null, source: "manual", documentId: null, applicationId: null,
  createdAt: "", updatedAt: "",
};

afterEach(cleanup);

describe("TaskRow", () => {
  it("shows overdue tasks and calls onToggle with an accessible button", () => {
    const onToggle = vi.fn();
    render(<TaskRow task={task} onToggle={onToggle} today="2026-10-17" />);
    expect(screen.getByText(/overdue/)).toBeTruthy();
    expect(screen.getByText("urgent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: 'Complete "Submit DSP assignment"' }));
    expect(onToggle).toHaveBeenCalledWith(task);
  });
});
