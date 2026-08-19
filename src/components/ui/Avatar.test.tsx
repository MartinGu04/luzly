import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Avatar } from "./Avatar";

afterEach(() => {
  cleanup();
});

describe("Avatar — initials fallback (no avatarUrl)", () => {
  it("shows initials when avatarUrl is omitted entirely", () => {
    const { container, getByText } = render(<Avatar name="דני בדיקה" />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("דב")).toBeInTheDocument();
  });

  it("shows initials when avatarUrl is explicitly null", () => {
    const { container, getByText } = render(<Avatar name="דני בדיקה" avatarUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("דב")).toBeInTheDocument();
  });

  it("a single-word name still produces initials, never a broken layout", () => {
    const { getByText } = render(<Avatar name="דני" avatarUrl={null} />);
    expect(getByText("דנ")).toBeInTheDocument();
  });
});

describe("Avatar — photo", () => {
  it("renders an <img> with the given avatarUrl, replacing the initials", () => {
    const { container, queryByText } = render(
      <Avatar name="דני בדיקה" avatarUrl="https://lh3.googleusercontent.com/a/photo.jpg" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/photo.jpg");
    expect(queryByText("דב")).toBeNull();
  });

  it("sets an empty alt (decorative) and no-referrer policy on the photo", () => {
    const { container } = render(
      <Avatar name="דני בדיקה" avatarUrl="https://lh3.googleusercontent.com/a/photo.jpg" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("referrerPolicy", "no-referrer");
  });
});

describe("Avatar — broken image falls back to initials, never a broken-image icon", () => {
  it("falls back to initials once the <img> fires onError", () => {
    const { container, getByText, queryByText } = render(
      <Avatar name="דני בדיקה" avatarUrl="https://lh3.googleusercontent.com/a/broken.jpg" />,
    );
    expect(queryByText("דב")).toBeNull();

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(getByText("דב")).toBeInTheDocument();
  });

  it("a fresh URL after a previous failure gets its own attempt, not a stuck fallback", () => {
    const { container, rerender } = render(
      <Avatar name="דני בדיקה" avatarUrl="https://lh3.googleusercontent.com/a/broken.jpg" />,
    );
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();

    rerender(<Avatar name="דני בדיקה" avatarUrl="https://lh3.googleusercontent.com/a/new-photo.jpg" />);

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/new-photo.jpg");
  });
});

describe("Avatar — xs size (dense table rows, e.g. Fairness)", () => {
  it("renders smaller than the default (md) size", () => {
    const { container: xsContainer } = render(<Avatar name="דני בדיקה" size="xs" avatarUrl={null} />);
    const xsRoot = xsContainer.firstElementChild as HTMLElement;
    expect(xsRoot.className).toContain("h-6");
    expect(xsRoot.className).toContain("w-6");
    cleanup();

    const { container: mdContainer } = render(<Avatar name="דני בדיקה" avatarUrl={null} />);
    const mdRoot = mdContainer.firstElementChild as HTMLElement;
    expect(mdRoot.className).toContain("h-10");
  });

  it("still shows the photo when available, and still falls back to initials otherwise", () => {
    const { container, getByText } = render(<Avatar name="דני בדיקה" size="xs" avatarUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("דב")).toBeInTheDocument();
    cleanup();

    const { container: photoContainer } = render(
      <Avatar name="דני בדיקה" size="xs" avatarUrl="https://lh3.googleusercontent.com/a/photo.jpg" />,
    );
    expect(photoContainer.querySelector("img")).toHaveAttribute(
      "src",
      "https://lh3.googleusercontent.com/a/photo.jpg",
    );
  });
});

describe("Avatar — identity independence", () => {
  it("avatarUrl never changes which name/initials would be computed -- purely a presentation swap", () => {
    const { getByText: getByTextNoPhoto } = render(<Avatar name="נועה דוגמה" avatarUrl={null} />);
    expect(getByTextNoPhoto("נד")).toBeInTheDocument();
    cleanup();

    const { container } = render(<Avatar name="נועה דוגמה" avatarUrl="https://lh3.googleusercontent.com/a/noa.jpg" />);
    // Same name, only the visual presentation differs -- no separate "identity" derived from avatarUrl.
    expect(container.querySelector("img")).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/noa.jpg");
  });
});
