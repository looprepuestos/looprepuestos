"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { recordActivity } from "@/lib/activity";

export function ActivityVisit() {
  const { session, profile, loading } = useAuth();
  useEffect(() => {
    if (loading || profile?.role === "ADMIN") return;
    const key = "loop-activity-visit";
    try { if (window.sessionStorage.getItem(key)) return; window.sessionStorage.setItem(key, "1"); } catch { /* sin storage */ }
    recordActivity(session, { type: "visit" });
  }, [loading, profile?.role, session]);
  return null;
}
