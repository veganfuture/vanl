"use client";
import { useState } from "react";

type CopyButtonProps =  { 
  text: string; 
  label: string; 
  success: string 
  className?: string;
}

export function CopyButton({ text, label, success, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  return (
    <button
      onClick={onCopy}
      className={className}
    >
      {copied ? success : label}
    </button>
  );
}
