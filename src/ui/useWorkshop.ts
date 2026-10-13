import { useEffect, useState, useSyncExternalStore } from "react";
import { WorkshopController } from "./workshopController";

export function useWorkshop() {
  const [controller] = useState(() => new WorkshopController());
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    void controller.resume();
    const hide = () => {
      void controller.suspend();
    };
    const show = () => {
      void controller.resume();
    };
    const interval = setInterval(() => {
      void controller.poll();
    }, 1500);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      void controller.suspend();
    };
  }, [controller]);
  return {
    ...state,
    dispatch: controller.dispatch,
    replace: controller.replace,
    setMessage: controller.setMessage,
    recover: controller.recover,
  };
}
