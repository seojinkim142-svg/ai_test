import { useEffect, useState } from "react";
import { AdMob, BannerAdPluginEvents } from "@capacitor-community/admob";
import { buildBannerOptions, initializeAdMob, isAdMobSupportedPlatform } from "../services/admob";

export function useAdMobBanner({ enabled }) {
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    if (!isAdMobSupportedPlatform()) {
      return undefined;
    }

    let disposed = false;
    const listenerHandles = [];

    const registerListener = async (eventName, listener) => {
      const handle = await AdMob.addListener(eventName, listener);
      if (disposed) {
        await handle.remove().catch(() => {});
        return null;
      }
      listenerHandles.push(handle);
      return handle;
    };

    const removeBanner = async () => {
      await AdMob.removeBanner().catch(() => {});
    };

    const syncBanner = async () => {
      if (!enabled) {
        setBannerHeight(0);
        await removeBanner();
        return;
      }

      try {
        const canRequestAds = await initializeAdMob();
        if (!canRequestAds || disposed) {
          if (!canRequestAds) setBannerHeight(0);
          return;
        }

        await registerListener(BannerAdPluginEvents.SizeChanged, (size) => {
          if (disposed) return;
          const nextHeight = Number(size?.height || 0);
          setBannerHeight(Number.isFinite(nextHeight) ? nextHeight : 0);
        });

        await registerListener(BannerAdPluginEvents.FailedToLoad, (error) => {
          console.warn("AdMob banner failed to load.", error);
          if (!disposed) setBannerHeight(0);
        });

        await removeBanner();
        if (disposed) return;
        await AdMob.showBanner(buildBannerOptions());
      } catch (error) {
        console.warn("Failed to sync AdMob banner.", error);
        if (!disposed) setBannerHeight(0);
      }
    };

    void syncBanner();

    return () => {
      disposed = true;
      void removeBanner();
      void Promise.all(listenerHandles.map((handle) => handle.remove().catch(() => {})));
    };
  }, [enabled]);

  return { bannerHeight };
}
