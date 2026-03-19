import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
} from "@capacitor-community/admob";

const GOOGLE_TEST_BANNER_ID_ANDROID = "ca-app-pub-3940256099942544/6300978111";
const ANDROID_PLATFORM = "android";
const androidBannerId = String(import.meta.env.VITE_ADMOB_BANNER_ID_ANDROID || "").trim();
const testingDeviceIds = String(import.meta.env.VITE_ADMOB_TEST_DEVICE_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

let initializePromise = null;
let warnedAboutTestBannerInProd = false;

export function isAdMobSupportedPlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === ANDROID_PLATFORM;
}

export function buildBannerOptions() {
  return {
    adId: androidBannerId || GOOGLE_TEST_BANNER_ID_ANDROID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
    isTesting: import.meta.env.DEV || !androidBannerId,
  };
}

export async function initializeAdMob() {
  if (!isAdMobSupportedPlatform()) return false;

  if (!initializePromise) {
    initializePromise = (async () => {
      if (import.meta.env.PROD && !androidBannerId && !warnedAboutTestBannerInProd) {
        warnedAboutTestBannerInProd = true;
        console.warn(
          "AdMob is using the Google test banner unit. Set VITE_ADMOB_BANNER_ID_ANDROID and ADMOB_APP_ID before release."
        );
      }

      await AdMob.initialize({
        initializeForTesting: import.meta.env.DEV && testingDeviceIds.length > 0,
        testingDevices: testingDeviceIds,
      });

      let consentInfo = await AdMob.requestConsentInfo();
      if (
        !consentInfo.canRequestAds &&
        consentInfo.isConsentFormAvailable &&
        consentInfo.status === AdmobConsentStatus.REQUIRED
      ) {
        consentInfo = await AdMob.showConsentForm();
      }

      return consentInfo.canRequestAds;
    })().catch((error) => {
      initializePromise = null;
      throw error;
    });
  }

  return initializePromise;
}
