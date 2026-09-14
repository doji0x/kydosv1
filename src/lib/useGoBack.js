import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Back navigation that never leaves the app.
 *
 * navigate(-1) walks the browser's history, so on a page opened directly — a shared
 * token link, a refresh, or the builder preview — the previous entry belongs to
 * whatever loaded the app, and "back" exits it. Stepping back only when this app
 * actually has an earlier entry keeps that from happening.
 */
export default function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  return useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}