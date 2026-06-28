"use client";

import { useCallback, useEffect, useState } from "react";
import { firebaseVapidKey, firebaseWebConfig } from "@/lib/firebase-client";

type Status = "unsupported" | "default" | "denied" | "registering" | "ready" | "error";

export function NotificationSetup() {
  const [status, setStatus] = useState<Status>("default");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      setStatus("ready");
    } else if (Notification.permission === "denied") {
      setStatus("denied");
    }
  }, []);

  const enableNotifications = useCallback(async () => {
    setMessage(null);
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      setMessage("This browser does not support web push.");
      return;
    }

    setStatus("registering");

    try {
      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging, getToken, onMessage, isSupported } = await import("firebase/messaging");

      if (!(await isSupported())) {
        setStatus("error");
        setMessage("Firebase messaging is not supported in this browser.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        setMessage("Permission denied. Allow notifications in browser site settings.");
        return;
      }

      const app = getApps().length ? getApps()[0]! : initializeApp(firebaseWebConfig);
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: firebaseVapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        setStatus("error");
        setMessage("Could not get an FCM token. Check Firebase authorized domains.");
        return;
      }

      const response = await fetch("/api/fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        setStatus("error");
        setMessage("Token received but server registration failed.");
        return;
      }

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Volume scan alert";
        const body = payload.notification?.body ?? "";
        const targetUrl =
          typeof payload.data?.url === "string"
            ? payload.data.url
            : payload.data?.snapshot_id
              ? `/runs/${payload.data.snapshot_id}`
              : "/";
        const notification = new Notification(title, { body, icon: "/file.svg", data: payload.data });
        notification.onclick = () => {
          window.focus();
          window.location.assign(targetUrl);
          notification.close();
        };
      });

      setStatus("ready");
      setMessage("Notifications enabled for this device.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Registration failed.");
    }
  }, []);

  if (status === "unsupported") {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "ready" ? (
        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          Notifications on
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void enableNotifications()}
          disabled={status === "registering" || status === "denied"}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "registering" ? "Enabling…" : "Enable notifications"}
        </button>
      )}
      {status === "denied" ? (
        <p className="max-w-xs text-right text-[11px] text-red-600">
          Blocked in browser. Reset site permissions and try again.
        </p>
      ) : null}
      {message ? (
        <p
          className={`max-w-xs text-right text-[11px] ${status === "error" ? "text-red-600" : "text-zinc-500"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
