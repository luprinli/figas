import React, { useEffect, useRef } from "react";

type Props = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  buttonRef: React.RefObject<HTMLButtonElement>;
  className?: string;
  children: React.ReactNode;
};

export default function Popup({
  isOpen,
  setIsOpen,
  buttonRef,
  className,
  children,
}: Props) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        !(buttonRef.current && buttonRef.current.contains(event.target as Node))
      ) {
        setIsOpen(false);
      }
    };

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, buttonRef, setIsOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Popup menu"
      className={["absolute z-10", className].filter(Boolean).join(" ")}
      ref={popupRef}
    >
      {children}
    </div>
  );
}
