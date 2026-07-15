import type { TourConfig } from "../types";

export const adminSettingsTour: TourConfig = {
  pageKey: "admin-settings",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "System Settings",
        description:
          "Configure global system parameters: company info, contact details, operational defaults, and integration keys.",
      },
    },
    {
      element: "form",
      popover: {
        title: "Settings Form",
        description:
          "Each setting is labelled with its purpose. Modify values and save to update the system configuration immediately.",
        side: "top",
      },
    },
    {
      element: "button[type=\"submit\"]",
      popover: {
        title: "Save Changes",
        description:
          "After editing settings, click Save to persist your changes. Some settings may require a server restart to take effect.",
        side: "top",
      },
    },
  ],
};

export default adminSettingsTour;
