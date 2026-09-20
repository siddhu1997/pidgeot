"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  buildUrlWithoutTransientAuthStatus,
  getAuthStatusNotification,
} from "@/lib/auth/auth-status";

export function AuthStatusToast() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const processedStatusRef = useRef("");
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const nextNotification = getAuthStatusNotification(searchParams);

    if (!nextNotification) {
      return;
    }

    const processedKey = `${nextNotification.kind}:${nextNotification.code}`;

    if (processedStatusRef.current === processedKey) {
      return;
    }

    processedStatusRef.current = processedKey;
    setNotification(nextNotification);
    router.replace(buildUrlWithoutTransientAuthStatus(pathname, searchParams), {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!notification) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setNotification(null);
    }, 4200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notification]);

  if (!notification) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-50 flex max-w-sm justify-end sm:right-8 sm:top-8">
      <div
        aria-live="polite"
        className={`auth-toast auth-toast--${notification.tone} pointer-events-auto rounded-[22px] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)] motion-safe:animate-[card-rise_220ms_ease-out]`}
        role="status"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">
          {notification.label}
        </p>
        <p className="mt-1 text-sm leading-6 text-white">{notification.message}</p>
      </div>
    </div>
  );
}