import "./index.css";

const windowType = window.location.hash;

if (windowType === "#onboarding") {
  console.log("[StayFree] Loading onboarding UI");
  import("./renderer/onboarding");
} else {
  // Default: hidden recorder window
  console.log("[StayFree] Loading recorder");
  import("./renderer/recorder");
}
