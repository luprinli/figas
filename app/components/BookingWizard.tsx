import { Link } from "@remix-run/react";
import PassengerIcon from "./icons/PassengerIcon";
import PaymentIcon from "./icons/PaymentIcon";
import ItineraryIcon from "./icons/ItineraryIcon";

/**
 * @deprecated This multi-step wizard is unused. Booking creation now uses a
 * single-page form in `operations.bookings.new.tsx` (Legs + Passengers in one page),
 * which provides a simpler, more efficient experience. Detail-page status management
 * uses `BookingTimeline` instead of wizard steps.
 *
 * Retained for reference — safe to remove in a future cleanup pass.
 */

interface Step {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface BookingWizardProps {
  bookingId: number;
  currentStep: string;
}

export default function BookingWizard({ bookingId, currentStep }: BookingWizardProps) {
  const steps: Step[] = [
    {
      label: "Itinerary",
      path: `/operations/bookings/${bookingId}/edit`,
      icon: <ItineraryIcon className="w-4 h-4" />,
    },
    {
      label: "Passengers",
      path: `/operations/bookings/${bookingId}/passengers`,
      icon: <PassengerIcon className="w-4 h-4" />,
    },
    {
      label: "Payment",
      path: `/operations/bookings/${bookingId}`,
      icon: <PaymentIcon className="w-4 h-4" />,
    },
  ];

  const currentIndex = steps.findIndex((s) => s.label.toLowerCase() === currentStep.toLowerCase());

  return (
    <nav aria-label="Booking progress" className="mb-6">
      <ol className="flex items-center gap-1 text-sm">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step.label} className="flex items-center gap-1">
              {index > 0 && (
                <span
                  className={`mx-1 text-xs ${
                    isCompleted ? "text-sky-500" : "text-slate-300 dark:text-slate-500"
                  }`}
                >
                  &rsaquo;
                </span>
              )}
              {isCurrent ? (
                <Link
                  to={step.path}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 dark:bg-sky-900/30 px-3 py-1.5 font-medium text-sky-700"
                  aria-current="step"
                >
                  {step.icon}
                  {step.label}
                </Link>
              ) : isCompleted ? (
                <Link
                  to={step.path}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  {step.icon}
                  {step.label}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-slate-300 dark:text-slate-500 cursor-default">
                  {step.icon}
                  {step.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
