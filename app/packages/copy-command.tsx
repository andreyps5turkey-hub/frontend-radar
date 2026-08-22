"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" onClick={copy} aria-label="Скопировать команду" title="Скопировать команду">
      {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
    </button>
  );
}
