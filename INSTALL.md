# Install FicShelf on your phone

FicShelf isn't in the App Store, so you build your own copy and install it. Setup is a one-time
job; updating later takes a few commands. (Expo Go can't run this app.)

> These steps follow Expo's and Apple's current docs (October 2026) and a check of this
> project. Nobody has run a full iPhone build of this branch yet. If a build fails, see
> [Troubleshooting](#troubleshooting) and tell the developer what the error said.

**How to run a command:** open a terminal. On **Windows**, press Start, type `cmd`, press Enter
(use Command Prompt rather than PowerShell for this guide). On a **Mac**, open Applications >
Utilities > **Terminal**. Copy one command box, paste it, press Enter, and wait for it to finish
before the next one. Boxes that follow "Find this line" or "Change it to" are text **inside a
file**, not commands.

---

## Which path is for you?

| Your situation | Path | Cost | The catch |
|---|---|---|---|
| iPhone, no Mac, OK paying Apple | **A. Cloud build (recommended)** | $99/year Apple membership | Needs any Windows/Mac/Linux computer for setup |
| iPhone and a Mac, free Apple ID | **B. Xcode on your Mac** | Free | The app stops opening after 7 days; you reinstall it by cable each week |
| iPhone, paid Apple account, prefer TestFlight | **C. TestFlight** | $99/year | Rebuild every 90 days |
| Android phone | **D. Android APK** | Free | None |

- Every path needs a computer for setup. It can't be done from the phone alone.
- A free Apple ID only works with Path B, which needs a Mac.
- Your iPhone needs **iOS 16.4 or later** (Settings > General > About).

---

## Path A: Cloud build (no Mac needed)

You need: a paid **Apple Developer Program** membership (99 USD/year, local price may differ), a
free **Expo** account (the free plan includes 15 iPhone builds a month, resets on the 1st, and
never charges you for going over), and a Windows, Mac or Linux computer.

### A1. Join the Apple Developer Program (do this first; it can take a day or more)
1. Go to https://developer.apple.com/programs/enroll/ and sign in with your Apple ID
   (two-factor authentication must be on).
2. Enroll as an **Individual**. You must be of legal age, use your legal name, and pay with a
   credit card in **your own name**. Apple may ask for a photo ID, which adds time.
3. Wait for the confirmation email.
4. Sign in at https://developer.apple.com/account and accept any agreement it shows.

### A2. Create a free Expo account
Sign up at https://expo.dev/signup.

### A3. Install Node.js and Git
- **Windows:** install the **LTS** version from https://nodejs.org and Git from
  https://git-scm.com (accept the defaults). Then close Command Prompt and open it again.
- **Mac:** install the **LTS** `.pkg` from https://nodejs.org. The first Git command below may
  pop up an offer to install "command line developer tools". Click **Install**, wait, then run the
  command again.
- **Linux:** install Git with your package manager, but install Node.js from https://nodejs.org
  (or nvm). Distro Node packages are usually too old.

Check Node. It must say **v22.13 or higher** (v24 is ideal):
```
node -v
```
If it shows a lower number, install the LTS from https://nodejs.org, reopen the terminal and check
again. Then check Git:
```
git --version
```

### A4. Download the FicShelf code
```
git clone --branch claude/ficshelf-fanfiction-app --single-branch https://github.com/Carnyte/mhm.git ficshelf
```
```
cd ficshelf
```
Run every later command inside this `ficshelf` folder. In a new terminal, run `cd ficshelf` first.

### A5. Install the app's building blocks
```
npm install
```
This takes a few minutes. "Deprecated" warnings and a line about "vulnerabilities" are normal.
**Do not run `npm audit fix`** (or `--force`): it changes package versions and can break the build.

### A6. Give the app your own ID
Every iPhone app has a **bundle identifier** that must be unique across all of Apple. If someone
else already registered `com.ficshelf.reader`, your build fails. Pick your own once and keep it,
because Apple ties the app's ID, its provisioning profile and Expo's saved credentials to it.

Open the settings file. Windows:
```
notepad app.json
```
Mac or Linux:
```
nano app.json
```
Find this line:
```
"bundleIdentifier": "com.ficshelf.reader",
```
Change it to something personal, for example:
```
"bundleIdentifier": "com.janesmith.ficshelf",
```
Use your own name. Only letters, numbers, dots and hyphens (no spaces, no `_`). Keep the quotes and
the comma. Save: Notepad **Ctrl+S**; nano **Ctrl+O**, Enter, **Ctrl+X**. (On a Mac don't use
TextEdit; its curly quotes break the file.)

Check the file. It should print the settings without an error, and `bundleIdentifier` should show
your new ID:
```
npx expo config --type public
```

### A7. Install Expo's build tool and log in
```
npm install --global eas-cli
```
On a Mac or Linux, if that fails with **EACCES** / "permission denied", run
`sudo npm install --global eas-cli` and type your computer password (nothing shows as you type).
Or skip the install and type `npx eas-cli@latest` everywhere this guide says `eas`.
```
eas login
```
A browser opens to log in. (`eas login --no-browser` lets you type email and password instead.)
Check it worked. It prints your Expo username:
```
eas whoami
```

### A8. Link the project to your Expo account
```
eas init
```
Answer **Y** to "Would you like to create a project for @you/ficshelf?" (If you belong to several
Expo accounts it first asks which one; pick yours.) It adds a project ID to `app.json`; that's
expected.

### A9. Register your iPhone (before building)
The app only installs on phones registered **before** the build. Do this at home or another
familiar place: if **Stolen Device Protection** is on and you're somewhere unfamiliar, iOS won't
let you install the registration profile.
```
eas device:create
```

| It asks | You answer |
|---|---|
| Would you like to use the *you* account? | **Y** |
| Apple ID / password | The Apple ID with the paid membership (the password only goes to Apple) |
| 6-digit code | The code shown on your Apple devices or sent by SMS |
| Which team (only if you have several) | Your paid team |
| How would you like to register your devices? | **Website** |

It shows a QR code and a link. **On the iPhone:**
1. Scan the QR code with the Camera app, or open the link in **Safari**.
2. Tap **Download Profile**, then **Allow**.
3. Within 8 minutes, open **Settings** and tap **Profile Downloaded** near the top (or Settings >
   General > **VPN & Device Management**).
4. Tap **Install** and enter your passcode. Safari shows a success page.

Check the phone is listed (it appears as a long code called a UDID):
```
eas device:list
```

### A10. Build the app in the cloud
```
eas build --platform ios --profile preview
```
**Always use `--profile preview`.** It makes a standalone app with everything inside.
(`development` needs a computer running a dev server; leaving out `--profile` makes an App Store
build you can't install from a link.)

| It asks | You answer |
|---|---|
| Do you want to log in to your Apple account? | **Y**, then Apple ID, password, code |
| Generate a new Apple Distribution Certificate? | **Y** |
| Reuse this distribution certificate? (only if you have one) | **Y** |
| Select devices for the ad hoc build | Your iPhone is already ticked. Press **Enter** |

"No remote versions are configured for this project…" is normal. The build uploads and prints a
link to its page. Free builds queue first, so it can take a while. You can press **Ctrl+C**; the
build keeps running in the cloud (on Windows, answer **Y** to "Terminate batch job?"). Follow it
at https://expo.dev or with:
```
eas build:list
```

### A11. Install it on the iPhone
When the build finishes, either open the build page on the computer (the printed link, or
expo.dev > your project > Builds), click **Install** and scan the QR code with the iPhone Camera,
or open the build link on the iPhone in Safari and tap **Install**. Confirm, and the FicShelf icon
appears.

(Anyone with the link can open the build page by default. To require an Expo sign-in, turn off
"Unauthenticated access to internal builds" in your Expo project settings.)

### A12. Turn on Developer Mode (once per iPhone)
1. Make sure the iPhone is **online**: the first launch checks in with Apple.
2. Tap FicShelf. An alert says Developer Mode is required. Tap **OK**.
3. Open **Settings > Privacy & Security**, scroll to **Security**, tap **Developer Mode**, turn it
   on, tap **Restart**.
4. After the restart, unlock, tap **Turn On** (or Enable) in the alert, enter your passcode.
5. Open FicShelf.

**Done.** See [First launch](#first-launch).

---

## Path B: Mac + free Apple ID

**Read first**
- Free, but the app **stops opening 7 days** after installing; plug in and reinstall (B14).
  Free Apple IDs allow 3 such apps per phone, 3 phones, and 10 new app IDs per 7 days.
- **Mac:** macOS **Tahoe 26.6 or later** for the current Xcode 27 (all Apple-silicon Macs, plus
  the 2019 16" MacBook Pro, 2020 13" MacBook Pro with four ports, 2020 27" iMac, 2019 Mac Pro).
- **iPhone:** Xcode 27 needs **iOS 17 or later**. For a phone stuck on iOS 16.4–16.x (iPhone 8 /
  8 Plus / X), use Xcode 26.6 instead (see B2).
- A USB cable that carries data.

### B1. Check versions
```
sw_vers -productVersion
```
26.6 or higher is needed for Xcode 27 (26.2+ for Xcode 26.6). Update in System Settings > General >
Software Update.

### B2. Install Xcode
Install **Xcode** from the Mac App Store, open it once and let it install its components.
(iOS 16 phone: instead download **Xcode 26.6** from https://developer.apple.com/download/all/
signed in with your Apple ID, unzip it and move it to Applications.) Then (the first two ask for
your Mac password; for Xcode 26.6 use its exact app name in the path):
```
sudo xcode-select -s /Applications/Xcode.app
```
```
sudo xcodebuild -license accept
```
```
xcodebuild -runFirstLaunch
```

### B3. Sign in to Xcode
Xcode > **Settings… > Apple Accounts** (older: Accounts) > **+** > Apple Account, and sign in.
You'll appear as "Your Name (Personal Team)".

### B4. Install Homebrew, Node.js and CocoaPods
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
When it finishes it prints **Next steps**: run **every** command listed there (usually three),
then close and reopen Terminal. Install the **Node.js LTS** `.pkg` from https://nodejs.org, then:
```
brew install cocoapods
```
```
node -v
```
It must say v22.13 or higher.

### B5. Download the code and install
```
git clone --branch claude/ficshelf-fanfiction-app https://github.com/Carnyte/mhm.git ficshelf
```
```
cd ficshelf
```
```
npm install
```
(Ignore "vulnerabilities"; don't run `npm audit fix`.)

### B6. Give the app your own ID (required)
```
nano app.json
```
Change `"bundleIdentifier": "com.ficshelf.reader",` to e.g. `"bundleIdentifier": "com.janesmith.ficshelf",`
(your name; letters, numbers, dots, hyphens only). Save with Ctrl+O, Enter, Ctrl+X.

### B7. Generate the iPhone project
```
npx expo prebuild -p ios
```
This creates an `ios` folder. (The project already handles Xcode 27's startup requirement and
leaves out the push-notification capability free Apple IDs can't use.) If a later re-run asks
"Continue with uncommitted changes?", answer **Y**; re-running recreates the folder, so redo B8 and B10.

### B8. Tell Xcode where Node is
```
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
```

### B9. Connect the iPhone and turn on Developer Mode
1. Plug in the iPhone, unlock it, tap **Trust This Computer**, enter your passcode.
2. In Xcode 27: **Xcode > Open Developer Tool > Device Hub** (Xcode 26: **Window > Devices and
   Simulators**). Pair if asked.
3. On the iPhone: **Settings > Privacy & Security > Developer Mode** → on → **Restart** → after
   restart tap **Turn On** and enter your passcode. (The switch only appears after the phone has
   been connected to Xcode.)

### B10. Set up signing
```
xed ios
```
In Xcode: click the blue **FicShelf** project in the left sidebar → under TARGETS click
**FicShelf** → **Signing & Capabilities** → tick **Automatically manage signing** (or click **Set
Up Signing**) → set **Team** to "Your Name (Personal Team)" → check **Bundle Identifier** shows your
ID → choose your iPhone at the top of the window (click **Register** if it appears).

### B11. Build a standalone copy
1. **Product > Scheme > Edit Scheme… > Run > Info**: set **Build Configuration** to **Release** and
   untick **Debug executable**. Close. (A Debug build only works while your Mac runs a dev server.)
2. Press **Cmd+R**. The first build takes a while.
3. If asked "codesign wants to access key", enter your Mac login password and click **Always Allow**.

### B12. Trust your developer certificate
If the first launch says **Untrusted Developer**: Settings > General > **VPN & Device Management**
→ **Apple Development: your email** → **Trust** (needs internet). Then open FicShelf.

### B13. Use it anywhere
Unplug; the app works without the Mac.

### B14. Every 7 days
When it stops opening, plug in, unlock, and from the `ficshelf` folder run:
```
npx expo run:ios --device --configuration Release --no-bundler
```
(or `xed ios` and Cmd+R). **Don't delete the app first**; that erases your library and downloads.
If the terminal says "No profiles … were found", build once from Xcode with Cmd+R, then retry.

Rebuild from the newest code. If you install a build from **before** the multi-source update
after the update has run, your library won't show properly in it. Nothing is lost: what you read
in the older build is merged back when you install the newer one again. Before installing an
update that changes the library format, use Settings → Back up library.

The AO3 update needs no extra setup and no native rebuild beyond the usual one: AO3 is switched
on when it starts (a "What's new" sheet says so; Settings → Sources turns it off), and it reaches
archiveofourown.org directly, without the hidden browser FanFiction.net needs.

---

## Path C: TestFlight (paid Apple account)

Use TestFlight **internal testing** only. It skips Apple's review. (External TestFlight and the App
Store are reviewed, and an unofficial reader for another company's site is likely to be rejected.)
TestFlight builds **expire after 90 days**.

1. Do A1–A8 (no device registration needed).
2. Run:
   ```
   eas build --platform ios --profile production --auto-submit
   ```
   It signs you in to Apple, creates certificates, builds, uploads to App Store Connect and enables
   internal TestFlight. If it asks whether the app only uses standard/exempt encryption, answer
   **Yes**. FicShelf only uses the phone's built-in HTTPS.
3. Apple processes the build (usually 5–10 minutes, not guaranteed) and emails you.
4. On the iPhone install **TestFlight** from the App Store, open the invite email, tap the link,
   then **Install**.
5. Before 90 days pass, run the step-2 command again.

---

## Path D: Android phone (free)

1. Do A2–A5, A7 and A8 (no Apple account needed).
2. Build:
   ```
   eas build --platform android --profile preview
   ```
   Answer **Y** to "Generate a new Android Keystore?" (Expo stores it for you).
3. When it finishes, open the build link on the phone (or scan the QR code on the build page),
   download the `.apk` and tap it.
4. Android asks to allow installs from the app you used (Chrome, Files…). Turn on **Install
   unknown apps** for it, go back, tap **Install**.

---

## First launch

- A **"Quick security check"** sheet may slide up because FanFiction.net uses Cloudflare. Tick
  **Verify you are human** once and the app continues.
- To log in: **Account** tab → **Log in**. If the site wants a captcha, or you use Google/another
  sign-in, the real FanFiction.net login page opens inside the app. (Google may block sign-in inside
  apps. If so, set a password on your FanFiction.net account and log in with email.)
- If the app seems stuck: Account → **Settings** → Connection → **Run security check now** or
  **Reconnect**. **Connection details** there copies a short report (no passwords or cookie
  values) you can paste when asking for help.
- **Listening (audiobook):** tap **Listen** on a story or the headphones button in the reader.
  It keeps playing with the screen locked. For a much more natural voice, download a free
  **Premium** or **Enhanced** voice under iOS **Settings → Accessibility → Read & Speak → Voices
  → English** (or the story's language). FicShelf uses the best installed voice automatically,
  or pick one in the player.
- **Other free voices:** apps that add voices to iOS work too. Install **Piper – Neural TTS**
  (free, App Store), open it, download a **medium** voice (for example Lessac or LJSpeech;
  "high" voices are slow), then pick it in FicShelf's player, where it's marked **Add-on**. If
  it goes missing after restarting the phone, open Piper once and it comes back.
- Allow notifications if you want new-chapter alerts.

---

## Troubleshooting

**Cloud builds (Paths A, C, D)**

| Problem | Fix |
|---|---|
| `The bundle identifier com.ficshelf.reader is not available…` | Do A6 (pick your own ID), then build again. |
| `Failed to provision N of the selected devices…` then "Do you want to continue without provisioning these devices?" | Choose **No (EAS CLI will exit)**. Apple is still processing the phone (Expo says up to 24–72 hours on new memberships). Check https://developer.apple.com/account/resources/devices/list and build again once it isn't "Processing". |
| App won't install on the phone | The build was made before the phone was registered. Run `eas device:create`, then build again. |
| App won't open, asks for Developer Mode | Do A12 (install the app first so the switch appears). |
| `PLA Update available…` | Sign in at https://developer.apple.com/account and accept the agreement. |
| Apple sign-in fails mentioning a "physical Security Key" | Add a trusted phone number or device as a second factor on your Apple Account, then retry. |
| Built with `development` or without `--profile` | Build again with `--profile preview`. |
| Builds are paused | You used the free plan's 15 iPhone builds this month; resets on the 1st, no charge. |

**Your computer**

| Problem | Fix |
|---|---|
| Windows: "running scripts is disabled on this system" | Use Command Prompt instead of PowerShell (or in PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`). |
| `git` not found | Install Git (A3), reopen the terminal. |
| `npm install --global eas-cli` fails | Use `npx eas-cli@latest` wherever the guide says `eas`. |
| Node version too low | Install the LTS from https://nodejs.org, reopen the terminal. |
| Warnings about package versions | Ignore them; they don't stop the build. |

**Mac + Xcode (Path B)**

| Problem | Fix |
|---|---|
| `Command PhaseScriptExecution failed` / "node: command not found" | Redo B8. |
| `No code signing certificates are available` | Do B3 and B10 (sign in, pick the team, select the phone). |
| Errors about missing pods | Always open with `xed ios`, never the `.xcodeproj`. |
| "Untrusted Developer" | Do B12. |
| Stopped opening after a week | Normal with a free Apple ID; do B14. |
| Xcode won't install to the phone | Xcode 27 needs iOS 17+ (iOS 16 phones: Xcode 26.6). Wireless install needs iOS 27; use a cable. |
| Hundreds of yellow warnings during the build | Normal. They come from React Native and Expo's own code; only red errors stop a build. |
| "Update to recommended settings" in Xcode | Ignore it. The `ios` folder is regenerated by `npx expo prebuild`. |

**In the app**

| Problem | Fix |
|---|---|
| Login says "Load failed", the website login page shows "404 Oops", or search says "Can't reach FanFiction.net" | Your build is older than the desktop-site fix. Update (see below). |
| No sound when listening | Turn the volume up. Check the voice in the player: if the story's language has no voice installed, add one in iOS Settings → Accessibility → Read & Speak → Voices. |
| Listening stops when the phone locks | Rebuild after updating. Background audio needs the current native project (`npx expo prebuild -p ios`). |

---

## Updating the app later

Your copy has your own bundle ID and project ID in `app.json`, so update with `--autostash`
(it keeps your edits):
```
git pull --autostash
```
```
npm install
```
If git reports a **conflict** in `app.json`, open it, keep your own `bundleIdentifier` and
`projectId` lines, and delete the `<<<<<<<`, `=======` and `>>>>>>>` marker lines.

Then rebuild:
- **Path A:** `eas build --platform ios --profile preview` (answer **Yes** to "reuse the profile"),
  and install the new build over the old app. **Don't delete FicShelf first** or you lose your
  library and downloads. Signing certificates and profiles last about a year, and the app stops
  opening if they expire or your Apple membership lapses, so rebuild at least once a year.
- **Add another iPhone (A):** `eas device:create` on the new phone, rebuild, answer **Y** to "choose
  the devices to provision again" and select all phones.
- **Path B:** run these from the `ficshelf` folder, one at a time:
  ```
  npx expo prebuild -p ios
  ```
  (answer **Y** if asked "Continue with uncommitted changes?")
  ```
  echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
  ```
  ```
  xed ios
  ```
  In Xcode, check **Signing & Capabilities** still shows your Personal Team (redo B10 if not), then
  press **Cmd+R** with the iPhone connected. Prebuild is needed whenever an update adds a native
  module (the audiobook update added Expo's audio module). Re-running it is always safe.
- **Path C:** rerun the Path C step-2 command.
- **Path D:** `eas build --platform android --profile preview`, install the new APK the same way.
