"use client";

import { useState } from "react";

type Props = {
  id: string;
  className?: string;
  open?: boolean;
  allowMultipleOpen?: boolean;
  children: React.ReactNode;
};

export function FaqDetails({
  id,
  className,
  open = false,
  allowMultipleOpen = true,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(open);

  if (allowMultipleOpen) {
    return (
      <details id={id} className={className} open={open}>
        {children}
      </details>
    );
  }

  return (
    <details
      id={id}
      className={className}
      open={isOpen}
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
      name="buildery-faq"
    >
      {children}
    </details>
  );
}
