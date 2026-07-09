import { Form, Link } from "@remix-run/react";
import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import Popup from "./Popup";
import { useTheme } from "./ThemeProvider";
import { resetAllTours } from "~/utils/tour/storage.client";

type Props = {
  user?: {
    name: string;
    email: string;
  } | null;
};

export default function ProfilePopup({ user }: Props) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupButtonRef = useRef<HTMLButtonElement>(null);
  const { theme, toggle } = useTheme();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="relative">
      <button
        className="flex items-center justify-center cursor-pointer"
        onClick={() => setIsPopupOpen(!isPopupOpen)}
        ref={popupButtonRef}
      >
        <div className="flex items-center justify-center w-12 h-12 text-sm font-semibold text-white rounded-full ring-2 ring-cyan-300 bg-cyan-600">
          {initials}
        </div>
      </button>
      {isPopupOpen && (
        <Popup
          isOpen={isPopupOpen}
          setIsOpen={setIsPopupOpen}
          buttonRef={popupButtonRef}
          className="right-0 p-4 mt-2 bg-white dark:bg-slate-800 rounded-md shadow-sm dark:shadow-slate-900/20 top-full dark:bg-slate-800"
        >
          <div className="px-2 py-2 text-sm dark:text-slate-200">
            <p className="font-semibold">{user?.name ?? "User"}</p>
            <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{user?.email ?? ""}</p>
          </div>
          <div className="py-2 space-y-1">
            <button
              type="button"
              onClick={toggle}
              className="flex w-full items-center justify-between px-4 py-2 text-sm transition rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <span>Dark Mode</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {theme === "dark" ? "\u263E" : "\u2600"}
              </span>
            </button>
            <Link
              to="/profile"
              className="flex items-center px-4 py-2 text-sm transition rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={() => {
                resetAllTours();
                window.location.reload();
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-left transition rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <RotateCcw size={14} aria-hidden />
              Reset onboarding tours
            </button>
            <Form action="/logout" method="POST">
              <button
                type="submit"
                className="w-full px-4 py-2 text-sm text-left transition rounded-md text-slate-700 dark:text-slate-200 hover:text-white hover:bg-cyan-500/90 dark:text-slate-300 dark:text-slate-500"
              >
                Logout
              </button>
            </Form>
          </div>
        </Popup>
      )}
    </div>
  );
}
