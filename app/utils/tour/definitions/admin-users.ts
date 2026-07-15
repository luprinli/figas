import type { TourConfig } from "../types";

export const adminUsersTour: TourConfig = {
  pageKey: "admin-users",
  version: 1,
  showProgress: true,
  autoStart: false,
  steps: [
    {
      popover: {
        title: "User Management",
        description:
          "View, create, and manage all system users. Each user can hold one or more roles with permission-based access control.",
      },
    },
    {
      element: '[data-tour="admin-users-search"]',
      popover: {
        title: "Search Users",
        description:
          "Filter the user list by name, email, or role to quickly find the account you need.",
        side: "bottom",
      },
    },
    {
      element: "table",
      popover: {
        title: "User Table",
        description:
          "Each row shows a user's name, email, role, and account status. Click a row to edit the user.",
        side: "top",
      },
    },
    {
      element: '[data-tour="admin-users-create"]',
      popover: {
        title: "Create User",
        description:
          "Add a new user with a name, email, password, date of birth, and initial role assignment.",
        side: "left",
      },
    },
  ],
};

export default adminUsersTour;
