import "./index.css";

const windowType = window.location.hash;

if (windowType === "#onboarding") {
  console.log("[StayFree] Loading onboarding UI");
  import("./renderer/onboarding");
} else if (windowType === "#settings") {
  console.log("[StayFree] Loading settings dashboard");
  import("./renderer/settings");
} else if (windowType === "#widget") {
  console.log("[StayFree] Loading floating widget");
  import("./renderer/widget");
} else {
  // Default: hidden recorder window (no hash)
  console.log("[StayFree] Loading recorder");
  import("./renderer/recorder");
}
