"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const DocumentViewerClient = dynamic(
  () => import("./DocumentViewerClient"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: 520,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-subtle)",
          color: "var(--text-muted)",
          borderRadius: 12,
        }}
      >
        Loading PDF viewer…
      </div>
    ),
  },
);

export type DocumentViewerProps = ComponentProps<typeof DocumentViewerClient>;

export default function DocumentViewer(props: DocumentViewerProps) {
  return <DocumentViewerClient {...props} />;
}
