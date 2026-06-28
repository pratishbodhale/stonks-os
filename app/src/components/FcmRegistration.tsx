"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";
import { firebaseVapidKey, firebaseWebConfig } from "@/lib/firebase-client";

export function FcmRegistration() {
  useEffect(() => {
    let cancelled = false;

    async function registerPush() {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        return;
      }

      const { initializeApp } = await import("firebase/app");
      const { getMessaging, getToken, onMessage, isSupported } = await import("firebase/messaging");

      if (!(await isSupported())) {
        return;
      }

      const app = initializeApp(firebaseWebConfig);
      const permission = await Notification.requestPermission();
      if (permission !== "granted" || cancelled) {
        return;
      }

      const registration = await navigator.serviceWorker.register(withBasePath("/firebase-messaging-sw.js"));
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: firebaseVapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token || cancelled) {
        return;
      }

      await fetch(withBasePath("/api/fcm-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Volume scan alert";
        const body = payload.notification?.body ?? "";
        const targetUrl =
          typeof payload.data?.url === "string"
            ? payload.data.url
            : payload.data?.snapshot_id
              ? withBasePath(`/runs/${payload.data.snapshot_id}`)
              : withBasePath("/");
        const notification = new Notification(title, {
          body,
          icon: withBasePath("/file.svg"),
          data: payload.data,
        });
        notification.onclick = () => {
          window.focus();
          window.location.assign(targetUrl);
          notification.close();
        };
      });
    }

    void registerPush().catch((error) => {
      console.warn("[FCM] Registration failed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
